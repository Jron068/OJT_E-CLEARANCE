from functools import wraps
from pathlib import Path
import re
import threading
from uuid import uuid4

from flask import Flask, abort, g, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from config import DEBUG, SECRET_KEY, create_connection

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "instance" / "uploads"
SCHEMA_LOCK = threading.Lock()
SCHEMA_READY = False


def ensure_users_full_name_column(connection):
    """Backfill the legacy users.full_name column required by account management."""
    cursor = connection.cursor()
    try:
        cursor.execute("SHOW COLUMNS FROM users LIKE 'full_name'")
        if cursor.fetchone() is not None:
            return

        cursor.execute("ALTER TABLE users ADD COLUMN full_name VARCHAR(150) NULL")
        cursor.execute("UPDATE users SET full_name = email WHERE full_name IS NULL")
        cursor.execute("ALTER TABLE users MODIFY full_name VARCHAR(150) NOT NULL")
        connection.commit()
    finally:
        cursor.close()


def password_policy_error(password):
    if not isinstance(password, str) or len(password) < 9 or len(password) > 128:
        return "Password must be at least 9 characters and no more than 128 characters."
    if not re.search(r"[a-z]", password) or not re.search(r"[A-Z]", password):
        return "Password must contain at least one lowercase and one uppercase letter."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain at least one special character."
    return None


def ensure_column(cursor, table, column, definition):
    cursor.execute(f"SHOW COLUMNS FROM `{table}` LIKE %s", (column,))
    if cursor.fetchone() is None:
        cursor.execute(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition}")


def ensure_extended_schema(connection):
    global SCHEMA_READY
    if SCHEMA_READY:
        return
    with SCHEMA_LOCK:
        if SCHEMA_READY:
            return
        ensure_users_full_name_column(connection)
        cursor = connection.cursor()
        try:
            for table, column, definition in (
                ("student_profile", "student_number", "VARCHAR(80) NULL"),
                ("student_profile", "program", "VARCHAR(150) NULL"),
                ("student_profile", "year_level", "VARCHAR(50) NULL"),
                ("student_profile", "emergency_number", "VARCHAR(30) NULL"),
                ("student_profile", "photo_url", "VARCHAR(255) NULL"),
                ("facilitator_profile", "contact_number", "VARCHAR(30) NULL"),
                ("facilitator_profile", "facilitator_id", "VARCHAR(80) NULL"),
                ("facilitator_profile", "address", "VARCHAR(255) NULL"),
                ("facilitator_profile", "emergency_number", "VARCHAR(30) NULL"),
                ("facilitator_profile", "position", "VARCHAR(120) NULL"),
                ("facilitator_profile", "photo_url", "VARCHAR(255) NULL"),
                ("ojt_info", "contacts", "VARCHAR(255) NULL"),
                ("ojt_info", "required_hours", "INT NULL"),
                ("ojt_info", "ojt_period", "VARCHAR(120) NULL"),
                ("forms", "audience", "VARCHAR(30) NOT NULL DEFAULT 'All'"),
                ("forms", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
                ("notifications", "title", "VARCHAR(200) NOT NULL DEFAULT 'Notification'"),
                ("notifications", "file_url", "VARCHAR(255) NULL"),
                ("documents", "reviewed_by", "BIGINT UNSIGNED NULL"),
                ("documents", "reviewed_at", "TIMESTAMP NULL"),
                ("documents", "review_notes", "TEXT NULL"),
            ):
                ensure_column(cursor, table, column, definition)
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS user_settings ("
                "user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,"
                "username VARCHAR(150) NULL, recovery_email VARCHAR(254) NULL,"
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                "CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) "
                "REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE)"
            )
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS notification_recipients ("
                "notification_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,"
                "is_read BOOLEAN NOT NULL DEFAULT FALSE, read_at TIMESTAMP NULL,"
                "PRIMARY KEY (notification_id, user_id),"
                "CONSTRAINT fk_notification_recipient_notification FOREIGN KEY (notification_id) "
                "REFERENCES notifications(id) ON UPDATE CASCADE ON DELETE CASCADE,"
                "CONSTRAINT fk_notification_recipient_user FOREIGN KEY (user_id) "
                "REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE)"
            )
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS facilitator_students ("
                "facilitator_user_id BIGINT UNSIGNED NOT NULL,"
                "student_user_id BIGINT UNSIGNED NOT NULL,"
                "PRIMARY KEY (facilitator_user_id, student_user_id),"
                "CONSTRAINT fk_facilitator_students_facilitator FOREIGN KEY (facilitator_user_id) "
                "REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,"
                "CONSTRAINT fk_facilitator_students_student FOREIGN KEY (student_user_id) "
                "REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE)"
            )
            connection.commit()
        finally:
            cursor.close()
        SCHEMA_READY = True


def json_body():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def current_user():
    cached_user = getattr(g, "portal_user", None)
    if cached_user is not None:
        return cached_user
    user_id = session.get("user_id")
    if not user_id:
        return None
    connection = create_connection()
    if connection is None:
        return None
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, full_name, email, role, status FROM users WHERE id = %s LIMIT 1",
            (user_id,),
        )
        user = cursor.fetchone()
        if not user or user["status"] != "Active":
            session.clear()
            return None
        return user
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


def create_notification(cursor, creator_id, title, message, recipient_roles=(), recipient_ids=None):
    cursor.execute(
        "INSERT INTO notifications (created_by, title, message) VALUES (%s, %s, %s)",
        (creator_id, title, message),
    )
    notification_id = cursor.lastrowid
    if recipient_ids is not None:
        active_recipient_ids = tuple(set(recipient_ids))
        if active_recipient_ids:
            placeholders = ", ".join(["%s"] * len(active_recipient_ids))
            cursor.execute(
                f"SELECT id FROM users WHERE status = 'Active' AND id IN ({placeholders})",
                active_recipient_ids,
            )
            recipients = cursor.fetchall()
            recipient_ids = [
                row["id"] if isinstance(row, dict) else row[0]
                for row in recipients
            ]
        else:
            recipient_ids = ()
    else:
        roles = tuple(set(recipient_roles))
        if roles:
            placeholders = ", ".join(["%s"] * len(roles))
            cursor.execute(
                f"SELECT id FROM users WHERE status = 'Active' AND role IN ({placeholders}) AND id != %s",
                (*roles, creator_id),
            )
            recipients = cursor.fetchall()
            recipient_ids = [
                row["id"] if isinstance(row, dict) else row[0]
                for row in recipients
            ]
        else:
            recipient_ids = ()
    if recipient_ids:
        cursor.executemany(
            "INSERT INTO notification_recipients (notification_id, user_id) VALUES (%s, %s)",
            [(notification_id, user_id) for user_id in recipient_ids],
        )
    return notification_id


app = Flask(__name__, template_folder=str(BASE_DIR / "templates"), static_folder=str(BASE_DIR / "static"))
app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    TEMPLATES_AUTO_RELOAD=True,
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,
)


@app.errorhandler(413)
def request_too_large(error):
    app.logger.warning("Rejected oversized upload: %s", error.description)
    return jsonify(error="The uploaded file is too large. The maximum size is 10 MB."), 413


ROLE_HOME = {
    "Administrator": "admin_dashboard",
    "Facilitator": "facilitator_dashboard",
    "OJT Student": "student_dashboard",
}
FACILITATOR_DEPARTMENTS = {
    "Information Technology",
    "Computer Science",
    "Accounting",
    "Education",
    "Psychology",
}


def require_role(*roles):
    def decorate(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not session.get("user_id"):
                if request.path.startswith("/api/"):
                    return jsonify(error="Sign in to continue."), 401
                return redirect(url_for("login"))
            user = current_user()
            if not user:
                session.clear()
                if request.path.startswith("/api/"):
                    return jsonify(error="Your session has expired. Sign in again."), 401
                return redirect(url_for("login"))
            g.portal_user = user
            role = user["role"]
            if roles and role not in roles:
                return abort(403)
            return view(*args, **kwargs)
        return wrapped
    return decorate


@app.get("/")
def login():
    if session.get("role") in ROLE_HOME:
        return redirect(url_for(ROLE_HOME[session["role"]]))
    return render_template("LogIn-Copy/index.html")


@app.get("/forgot-password")
def forgot_password_route():
    return render_template("LogIn-Copy/forgot_password.html")


@app.post("/api/login")
def api_login():
    payload = json_body()
    email = str(payload.get("email") or payload.get("username") or "").strip().lower()
    password = payload.get("password")
    if not email or not isinstance(password, str) or not password:
        return jsonify(error="Enter your email and password."), 400

    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable. Check the database settings and try again."), 503
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id, email, password_hash, role, status FROM users WHERE email = %s LIMIT 1", (email,))
        user = cursor.fetchone()
    except Exception:
        app.logger.exception("Login database query failed")
        return jsonify(error="Unable to sign in right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()

    try:
        password_matches = bool(user and check_password_hash(user["password_hash"], password))
    except (TypeError, ValueError):
        password_matches = False
    if not user or user["status"] != "Active" or not password_matches:
        return jsonify(error="Invalid email or password, or the account is inactive."), 401
    if user["role"] not in ROLE_HOME:
        return jsonify(error="This account role cannot access the portal."), 403

    session.clear()
    session["user_id"] = user["id"]
    session["email"] = user["email"]
    session["role"] = user["role"]
    return jsonify(email=user["email"], role=user["role"], redirect=url_for(ROLE_HOME[user["role"]]))


@app.post("/logout")
def logout():
    session.clear()
    return jsonify(redirect=url_for("login")) if request.is_json else redirect(url_for("login"))


@app.get("/api/me")
@require_role()
def api_me():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    return jsonify(user=user)


@app.route("/api/profile", methods=["GET", "PUT"])
@require_role()
def api_profile():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if user["role"] == "OJT Student":
            cursor.execute(
                "SELECT u.full_name, u.email, p.student_number, p.program, p.year_level, "
                "p.contact_number, p.emergency_number, p.address, p.photo_url "
                "FROM users u LEFT JOIN student_profile p ON p.user_id = u.id WHERE u.id = %s",
                (user["id"],),
            )
        else:
            cursor.execute(
                "SELECT u.full_name, u.email, p.facilitator_name, p.facilitator_id, p.department, p.contact_number, "
                "p.address, p.emergency_number, p.position, p.photo_url, p.signature_url "
                "FROM users u LEFT JOIN facilitator_profile p ON p.user_id = u.id WHERE u.id = %s",
                (user["id"],),
            )
        profile = cursor.fetchone() or {}
        if request.method == "GET":
            return jsonify(profile=profile)
        payload = json_body()
        full_name = str(payload.get("fullName") or "").strip()
        if not full_name or len(full_name) > 150:
            return jsonify(error="Enter a name up to 150 characters."), 400
        department = str(payload.get("department") or "").strip()
        if user["role"] == "Facilitator" and department not in FACILITATOR_DEPARTMENTS:
            return jsonify(error="Choose a valid facilitator department."), 400
        cursor.execute("UPDATE users SET full_name = %s WHERE id = %s", (full_name, user["id"]))
        if user["role"] == "OJT Student":
            cursor.execute(
                "INSERT INTO student_profile (user_id, student_name, student_number, program, year_level, contact_number, emergency_number, address) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE "
                "student_name = VALUES(student_name), student_number = VALUES(student_number), "
                "program = VALUES(program), year_level = VALUES(year_level), "
                "contact_number = VALUES(contact_number), emergency_number = VALUES(emergency_number), "
                "address = VALUES(address)",
                (
                    user["id"], full_name, payload.get("studentNumber"), payload.get("program"),
                    payload.get("yearLevel"), payload.get("contactNumber"),
                    payload.get("emergencyNumber"), payload.get("address"),
                ),
            )
        else:
            cursor.execute(
                "INSERT INTO facilitator_profile (user_id, facilitator_name, facilitator_id, department, contact_number, address, emergency_number, position) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE "
                "facilitator_name = VALUES(facilitator_name), facilitator_id = VALUES(facilitator_id), "
                "department = VALUES(department), "
                "contact_number = VALUES(contact_number), address = VALUES(address), "
                "emergency_number = VALUES(emergency_number), position = VALUES(position)",
                (
                    user["id"], full_name, payload.get("facilitatorId"), department,
                    payload.get("contactNumber"), payload.get("address"),
                    payload.get("emergencyNumber"), payload.get("position"),
                ),
            )
        connection.commit()
        session["full_name"] = full_name
        return jsonify(message="Profile saved.", profile=payload)
    except Exception:
        connection.rollback()
        app.logger.exception("Profile operation failed")
        return jsonify(error="Unable to save your profile right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.post("/api/profile/photo")
@require_role()
def api_profile_photo():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    upload = request.files.get("photo")
    if upload is None or not upload.filename:
        return jsonify(error="Choose an image file."), 400
    extension = Path(secure_filename(upload.filename)).suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        return jsonify(error="Use a JPG, PNG, or WEBP image."), 400
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    stored_name = f"{uuid4().hex}{extension}"
    try:
        ensure_extended_schema(connection)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        upload.save(UPLOAD_DIR / stored_name)
        cursor = connection.cursor()
        if user["role"] == "OJT Student":
            cursor.execute(
                "INSERT INTO student_profile (user_id, student_name, photo_url) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE photo_url = VALUES(photo_url)",
                (user["id"], user["full_name"], stored_name),
            )
        else:
            cursor.execute(
                "INSERT INTO facilitator_profile (user_id, facilitator_name, photo_url) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE photo_url = VALUES(photo_url)",
                (user["id"], user["full_name"], stored_name),
            )
        connection.commit()
        return jsonify(message="Profile photo saved.", photoUrl=url_for("api_profile_photo_file"))
    except Exception:
        connection.rollback()
        (UPLOAD_DIR / stored_name).unlink(missing_ok=True)
        app.logger.exception("Profile photo upload failed")
        return jsonify(error="Unable to save the profile photo right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.get("/api/profile/photo")
@require_role()
def api_profile_photo_file():
    user = current_user()
    if user is None:
        abort(401)
    connection = create_connection()
    if connection is None:
        abort(503)
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor()
        table, field = (
            ("student_profile", "photo_url")
            if user["role"] == "OJT Student"
            else ("facilitator_profile", "photo_url")
        )
        cursor.execute(f"SELECT `{field}` FROM `{table}` WHERE user_id = %s", (user["id"],))
        row = cursor.fetchone()
        if not row or not row[0]:
            abort(404)
        return send_from_directory(UPLOAD_DIR, row[0])
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/profile/signature", methods=["GET", "POST"])
@require_role("Facilitator")
def api_profile_signature():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor()
        if request.method == "GET":
            cursor.execute(
                "SELECT signature_url FROM facilitator_profile WHERE user_id = %s",
                (user["id"],),
            )
            row = cursor.fetchone()
            if not row or not row[0]:
                abort(404)
            return send_from_directory(UPLOAD_DIR, row[0])
        upload = request.files.get("signature")
        if upload is None or not upload.filename:
            return jsonify(error="Choose an image file for your signature."), 400
        extension = Path(secure_filename(upload.filename)).suffix.lower()
        if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
            return jsonify(error="Use a JPG, PNG, or WEBP signature image."), 400
        stored_name = f"{uuid4().hex}{extension}"
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        upload.save(UPLOAD_DIR / stored_name)
        cursor.execute(
            "INSERT INTO facilitator_profile (user_id, facilitator_name, signature_url) "
            "VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE signature_url = VALUES(signature_url)",
            (user["id"], user["full_name"], stored_name),
        )
        connection.commit()
        return jsonify(message="E-signature saved.")
    except HTTPException:
        raise
    except Exception:
        connection.rollback()
        app.logger.exception("Facilitator signature operation failed")
        return jsonify(error="Unable to process the signature right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/settings", methods=["GET", "PUT"])
@require_role()
def api_settings():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if request.method == "GET":
            cursor.execute("SELECT username, recovery_email FROM user_settings WHERE user_id = %s", (user["id"],))
            settings = cursor.fetchone() or {}
            settings["username"] = settings.get("username") or user["full_name"]
            return jsonify(settings=settings)
        payload = json_body()
        username = str(payload.get("username") or user["full_name"]).strip()
        recovery_email = str(payload.get("recoveryEmail") or "").strip().lower()
        if not username or len(username) > 150:
            return jsonify(error="Enter a username up to 150 characters."), 400
        if recovery_email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", recovery_email):
            return jsonify(error="Enter a valid recovery email."), 400
        cursor.execute(
            "INSERT INTO user_settings (user_id, username, recovery_email) VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE username = VALUES(username), recovery_email = VALUES(recovery_email)",
            (user["id"], username, recovery_email or None),
        )
        connection.commit()
        return jsonify(message="Settings saved.")
    except Exception:
        connection.rollback()
        app.logger.exception("Settings operation failed")
        return jsonify(error="Unable to save settings right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.post("/api/password")
@require_role()
def api_change_password():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    payload = json_body()
    current_password = payload.get("currentPassword")
    new_password = payload.get("newPassword")
    confirmation = payload.get("confirmPassword")
    password_error = password_policy_error(new_password)
    if password_error:
        return jsonify(error=password_error), 400
    if new_password != confirmation:
        return jsonify(error="The new passwords do not match."), 400
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
        row = cursor.fetchone()
        if not row or not check_password_hash(row["password_hash"], current_password or ""):
            return jsonify(error="Current password is incorrect."), 400
        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (generate_password_hash(new_password), user["id"]),
        )
        connection.commit()
        return jsonify(message="Password changed successfully.")
    except Exception:
        connection.rollback()
        app.logger.exception("Password update failed")
        return jsonify(error="Unable to change your password right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/ojt-info", methods=["GET", "PUT"])
@require_role("OJT Student")
def api_ojt_info():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if request.method == "GET":
            cursor.execute(
                "SELECT company_name, program, contacts, required_hours, ojt_period "
                "FROM ojt_info i JOIN student_profile p ON p.id = i.student_id WHERE p.user_id = %s",
                (user["id"],),
            )
            return jsonify(info=cursor.fetchone() or {})
        payload = json_body()
        company = str(payload.get("companyName") or "").strip()
        program = str(payload.get("program") or "").strip()
        hours = payload.get("requiredHours")
        if not company or not program:
            return jsonify(error="Company and program are required."), 400
        try:
            hours = int(hours) if hours not in (None, "") else None
            if hours is not None and not 1 <= hours <= 10000:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify(error="Required hours must be a number between 1 and 10000."), 400
        cursor.execute(
            "INSERT INTO student_profile (user_id, student_name) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE student_name = VALUES(student_name)",
            (user["id"], user["full_name"]),
        )
        cursor.execute("SELECT id FROM student_profile WHERE user_id = %s", (user["id"],))
        student_profile_id = cursor.fetchone()["id"]
        cursor.execute(
            "INSERT INTO ojt_info (student_id, company_name, program, contacts, required_hours, ojt_period) "
            "VALUES (%s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE "
            "company_name = VALUES(company_name), program = VALUES(program), contacts = VALUES(contacts), "
            "required_hours = VALUES(required_hours), ojt_period = VALUES(ojt_period)",
            (
                student_profile_id, company, program, payload.get("contacts"), hours,
                payload.get("ojtPeriod"),
            ),
        )
        create_notification(
            cursor,
            user["id"],
            "OJT information updated",
            f"{user['full_name']} updated their OJT information.",
            ("Facilitator", "Administrator"),
        )
        connection.commit()
        return jsonify(message="OJT information saved.")
    except Exception:
        connection.rollback()
        app.logger.exception("OJT information operation failed")
        return jsonify(error="Unable to save OJT information right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/documents", methods=["GET", "POST"])
@require_role()
def api_documents():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if request.method == "GET":
            query = (
                "SELECT d.id, d.title, d.date_uploaded, d.status, d.file_url, "
                "u.full_name AS student_name, p.student_number, u.id AS owner_id "
                "FROM documents d JOIN student_profile p ON p.id = d.student_id "
                "JOIN users u ON u.id = p.user_id"
            )
            params = ()
            if user["role"] == "OJT Student":
                query += " WHERE u.id = %s"
                params = (user["id"],)
            query += " ORDER BY d.date_uploaded DESC"
            cursor.execute(query, params)
            return jsonify(documents=cursor.fetchall())
        if user["role"] != "OJT Student":
            return jsonify(error="Only students can submit documents."), 403
        title = str(request.form.get("title") or "").strip()
        upload = request.files.get("file")
        if not title or len(title) > 200 or upload is None or not upload.filename:
            return jsonify(error="Select a document type and file."), 400
        safe_name = secure_filename(upload.filename)
        extension = Path(safe_name).suffix.lower()
        if extension not in {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"}:
            return jsonify(error="Allowed file types are PDF, DOC, DOCX, JPG, and PNG."), 400
        cursor.execute(
            "INSERT INTO student_profile (user_id, student_name) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE student_name = VALUES(student_name)",
            (user["id"], user["full_name"]),
        )
        cursor.execute("SELECT id FROM student_profile WHERE user_id = %s", (user["id"],))
        student_profile_id = cursor.fetchone()["id"]
        stored_name = f"{uuid4().hex}{extension}"
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        upload.save(UPLOAD_DIR / stored_name)
        try:
            cursor.execute(
                "INSERT INTO documents (student_id, title, status, file_url) VALUES (%s, %s, 'Pending', %s)",
                (student_profile_id, title, stored_name),
            )
            document_id = cursor.lastrowid
            create_notification(
                cursor, user["id"], "Document submitted",
                f"{user['full_name']} submitted {title} for review.",
                ("Facilitator", "Administrator"),
            )
            connection.commit()
        except Exception:
            (UPLOAD_DIR / stored_name).unlink(missing_ok=True)
            raise
        return jsonify(message="Document submitted for review.", id=document_id), 201
    except Exception as error:
        connection.rollback()
        if getattr(error, "errno", None) == 1146:
            app.logger.exception("Documents schema is not initialized")
            return jsonify(error="Database tables are missing. Run schema.sql and retry."), 500
        app.logger.exception("Document operation failed")
        return jsonify(error="Unable to process documents right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.patch("/api/documents/<int:document_id>")
@require_role("Facilitator", "Administrator")
def api_update_document(document_id):
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    payload = json_body()
    status = payload.get("status")
    if status not in {"Pending", "Verified", "Rejected", "For Revision"}:
        return jsonify(error="Choose a valid document status."), 400
    remarks = str(payload.get("remarks") or "").strip()
    if len(remarks) > 2000:
        return jsonify(error="Review notes must not exceed 2000 characters."), 400
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT d.title, u.id AS student_user_id FROM documents d "
            "JOIN student_profile p ON p.id = d.student_id JOIN users u ON u.id = p.user_id "
            "WHERE d.id = %s",
            (document_id,),
        )
        document = cursor.fetchone()
        if not document:
            return jsonify(error="Document not found."), 404
        cursor.execute(
            "UPDATE documents SET status = %s, reviewed_by = %s, reviewed_at = CURRENT_TIMESTAMP, "
            "review_notes = %s WHERE id = %s",
            (status, user["id"], remarks or None, document_id),
        )
        cursor.execute(
            "INSERT INTO notifications (created_by, title, message) VALUES (%s, %s, %s)",
            (
                user["id"],
                "Document status updated",
                f"{document['title']} status changed to {status}."
                + (f" Review notes: {remarks}" if remarks else ""),
            ),
        )
        notification_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO notification_recipients (notification_id, user_id) VALUES (%s, %s)",
            (notification_id, document["student_user_id"]),
        )
        connection.commit()
        return jsonify(message="Document status updated.")
    except Exception:
        connection.rollback()
        app.logger.exception("Document status update failed")
        return jsonify(error="Unable to update the document right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.get("/api/documents/<int:document_id>/file")
@require_role()
def api_document_file(document_id):
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT d.file_url, u.id AS owner_id FROM documents d "
            "JOIN student_profile p ON p.id = d.student_id JOIN users u ON u.id = p.user_id "
            "WHERE d.id = %s",
            (document_id,),
        )
        row = cursor.fetchone()
        if not row or not row["file_url"]:
            abort(404)
        if user["role"] == "OJT Student" and row["owner_id"] != user["id"]:
            abort(403)
        return send_from_directory(UPLOAD_DIR, row["file_url"], as_attachment=True)
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/notifications", methods=["GET", "POST"])
@require_role()
def api_notifications():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if request.method == "GET":
            cursor.execute(
                "SELECT n.id, n.title, n.message, n.sent_date, n.file_url, sender.full_name AS sender, "
                "COALESCE(r.is_read, FALSE) AS is_read FROM notifications n "
                "JOIN users sender ON sender.id = n.created_by "
                "LEFT JOIN notification_recipients r ON r.notification_id = n.id AND r.user_id = %s "
                "WHERE r.user_id = %s OR n.created_by = %s "
                "ORDER BY n.sent_date DESC LIMIT 100",
                (user["id"], user["id"], user["id"]),
            )
            notifications = cursor.fetchall()
            cursor.execute(
                "SELECT COUNT(*) AS unread FROM notification_recipients WHERE user_id = %s AND is_read = FALSE",
                (user["id"],),
            )
            return jsonify(notifications=notifications, unread=cursor.fetchone()["unread"])
        if user["role"] not in {"Administrator", "Facilitator"}:
            return jsonify(error="You are not allowed to post announcements."), 403
        payload = request.form if request.mimetype == "multipart/form-data" else json_body()
        title = str(payload.get("title") or "").strip()
        message = str(payload.get("message") or "").strip()
        target_role = payload.get(
            "targetRole",
            "All" if user["role"] == "Administrator" else "OJT Student",
        )
        if not title or len(title) > 200 or not message or len(message) > 5000:
            return jsonify(error="Enter a title and message within the allowed length."), 400
        if target_role not in {"OJT Student", "Facilitator", "Administrator", "All"}:
            return jsonify(error="Choose a valid notification audience."), 400
        roles = ("OJT Student", "Facilitator", "Administrator") if target_role == "All" else (target_role,)
        upload = request.files.get("file")
        stored_name = None
        if upload and upload.filename:
            extension = Path(secure_filename(upload.filename)).suffix.lower()
            if extension not in {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"}:
                return jsonify(error="Notification attachments must be PDF, DOC, DOCX, JPG, or PNG."), 400
            stored_name = f"{uuid4().hex}{extension}"
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            upload.save(UPLOAD_DIR / stored_name)
        notification_id = create_notification(cursor, user["id"], title, message, roles)
        if stored_name:
            cursor.execute(
                "UPDATE notifications SET file_url = %s WHERE id = %s",
                (stored_name, notification_id),
            )
        connection.commit()
        return jsonify(message="Notification sent."), 201
    except Exception:
        connection.rollback()
        if "stored_name" in locals() and stored_name:
            (UPLOAD_DIR / stored_name).unlink(missing_ok=True)
        app.logger.exception("Notification operation failed")
        return jsonify(error="Unable to process notifications right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.get("/api/notifications/<int:notification_id>/file")
@require_role()
def api_notification_file(notification_id):
    user = current_user()
    if user is None:
        abort(401)
    connection = create_connection()
    if connection is None:
        abort(503)
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor()
        cursor.execute(
            "SELECT n.file_url FROM notifications n LEFT JOIN notification_recipients r "
            "ON r.notification_id = n.id AND r.user_id = %s "
            "WHERE n.id = %s AND (n.created_by = %s OR r.user_id = %s)",
            (user["id"], notification_id, user["id"], user["id"]),
        )
        row = cursor.fetchone()
        if not row or not row[0]:
            abort(404)
        return send_from_directory(UPLOAD_DIR, row[0], as_attachment=True)
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.patch("/api/notifications/read")
@require_role()
def api_mark_notifications_read():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor()
        cursor.execute(
            "UPDATE notification_recipients SET is_read = TRUE, read_at = CURRENT_TIMESTAMP "
            "WHERE user_id = %s AND is_read = FALSE",
            (user["id"],),
        )
        connection.commit()
        return jsonify(message="Notifications marked as read.")
    except Exception:
        connection.rollback()
        app.logger.exception("Notification read state update failed")
        return jsonify(error="Unable to update notifications right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/forms", methods=["GET", "POST"])
@require_role()
def api_forms():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if request.method == "GET":
            cursor.execute("SELECT COUNT(*) AS total FROM forms")
            if cursor.fetchone()["total"] == 0:
                forms_dir = BASE_DIR / "static" / "student_copy" / "forms"
                for path in sorted(forms_dir.glob("ojt_form*.pdf")):
                    number = path.stem.removeprefix("ojt_form")
                    cursor.execute(
                        "INSERT INTO forms (created_by, title, file_url, audience) "
                        "VALUES (%s, %s, %s, 'All')",
                        (user["id"], f"OJT Form {number}", f"static:{path.name}"),
                    )
                connection.commit()
            if user["role"] == "Administrator":
                cursor.execute(
                    "SELECT id, title, file_url, audience FROM forms WHERE is_active = TRUE ORDER BY title"
                )
            elif user["role"] == "OJT Student":
                cursor.execute(
                    "SELECT f.id, f.title, f.file_url, f.audience FROM forms f "
                    "JOIN users creator ON creator.id = f.created_by "
                    "WHERE f.is_active = TRUE AND ("
                    "(f.file_url LIKE 'static:%' OR "
                    "(creator.role <> 'Facilitator' AND f.audience IN ('All', 'OJT Student'))) "
                    "OR (creator.role = 'Facilitator' AND f.audience IN ('All', 'OJT Student') "
                    "AND EXISTS (SELECT 1 FROM facilitator_students fs "
                    "WHERE fs.facilitator_user_id = f.created_by AND fs.student_user_id = %s))) "
                    "ORDER BY f.title",
                    (user["id"],),
                )
            elif user["role"] == "Facilitator":
                cursor.execute(
                    "SELECT id, title, file_url, audience FROM forms WHERE is_active = TRUE "
                    "AND (created_by = %s OR audience IN ('All', 'Facilitator')) ORDER BY title",
                    (user["id"],),
                )
            else:
                cursor.execute(
                    "SELECT id, title, file_url, audience FROM forms WHERE is_active = TRUE "
                    "AND (audience = 'All' OR audience = %s) ORDER BY title",
                    (user["role"],),
                )
            return jsonify(forms=cursor.fetchall())
        if user["role"] not in {"Administrator", "Facilitator"}:
            return jsonify(error="You are not allowed to manage OJT forms."), 403
        title = str(request.form.get("title") or "").strip()
        audience = request.form.get("audience", "All")
        if user["role"] == "Facilitator":
            audience = "OJT Student"
        upload = request.files.get("file")
        if not title or len(title) > 200 or audience not in {"All", "OJT Student", "Facilitator"}:
            return jsonify(error="Enter a valid form title and audience."), 400
        if upload is None or not upload.filename:
            return jsonify(error="Choose a form file."), 400
        extension = Path(secure_filename(upload.filename)).suffix.lower()
        if extension not in {".pdf", ".doc", ".docx"}:
            return jsonify(error="Upload a PDF, DOC, or DOCX form."), 400
        stored_name = f"{uuid4().hex}{extension}"
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        upload.save(UPLOAD_DIR / stored_name)
        cursor.execute(
            "INSERT INTO forms (created_by, title, file_url, audience) VALUES (%s, %s, %s, %s)",
            (user["id"], title, stored_name, audience),
        )
        form_id = cursor.lastrowid
        if user["role"] == "Facilitator":
            cursor.execute(
                "SELECT student_user_id FROM facilitator_students WHERE facilitator_user_id = %s",
                (user["id"],),
            )
            assigned_students = cursor.fetchall()
            create_notification(
                cursor,
                user["id"],
                "New OJT form available",
                f"{title} is now available in the OJT forms page.",
                recipient_ids=[
                    row["student_user_id"] if isinstance(row, dict) else row[0]
                    for row in assigned_students
                ],
            )
        elif audience in {"All", "OJT Student"}:
            create_notification(
                cursor,
                user["id"],
                "New OJT form available",
                f"{title} is now available in the OJT forms page.",
                ("OJT Student",),
            )
        connection.commit()
        return jsonify(message="Form uploaded.", id=form_id), 201
    except Exception:
        connection.rollback()
        app.logger.exception("Forms operation failed")
        return jsonify(error="Unable to process forms right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.delete("/api/forms/<int:form_id>")
@require_role("Administrator")
def api_delete_form(form_id):
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor()
        cursor.execute("UPDATE forms SET is_active = FALSE WHERE id = %s AND is_active = TRUE", (form_id,))
        if cursor.rowcount == 0:
            return jsonify(error="Form not found."), 404
        connection.commit()
        return jsonify(message="Form removed from the portal.")
    except Exception:
        connection.rollback()
        app.logger.exception("Form removal failed")
        return jsonify(error="Unable to remove the form right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.get("/api/forms/<int:form_id>/file")
@require_role()
def api_form_file(form_id):
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor()
        if user["role"] == "Administrator":
            cursor.execute("SELECT file_url FROM forms WHERE id = %s AND is_active = TRUE", (form_id,))
        elif user["role"] == "OJT Student":
            cursor.execute(
                "SELECT f.file_url FROM forms f JOIN users creator ON creator.id = f.created_by "
                "WHERE f.id = %s AND f.is_active = TRUE AND ("
                "(f.file_url LIKE 'static:%' OR "
                "(creator.role <> 'Facilitator' AND f.audience IN ('All', 'OJT Student'))) "
                "OR (creator.role = 'Facilitator' AND f.audience IN ('All', 'OJT Student') "
                "AND EXISTS (SELECT 1 FROM facilitator_students fs "
                "WHERE fs.facilitator_user_id = f.created_by AND fs.student_user_id = %s)))",
                (form_id, user["id"]),
            )
        elif user["role"] == "Facilitator":
            cursor.execute(
                "SELECT file_url FROM forms WHERE id = %s AND is_active = TRUE "
                "AND (created_by = %s OR audience IN ('All', 'Facilitator'))",
                (form_id, user["id"]),
            )
        else:
            cursor.execute(
                "SELECT file_url FROM forms WHERE id = %s AND is_active = TRUE "
                "AND (audience = 'All' OR audience = %s)",
                (form_id, user["role"]),
            )
        row = cursor.fetchone()
        if not row:
            abort(404)
        if row[0].startswith("static:"):
            return send_from_directory(
                BASE_DIR / "static" / "student_copy" / "forms",
                row[0].removeprefix("static:"),
                as_attachment=True,
            )
        return send_from_directory(UPLOAD_DIR, row[0], as_attachment=True)
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/users", methods=["GET", "POST"])
@require_role("Administrator")
def api_users():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if request.method == "GET":
            cursor.execute(
                "SELECT u.id, u.full_name AS fullName, u.email, u.role, u.status, "
                "DATE_FORMAT(u.created_at, '%Y-%m-%d') AS dateCreated, "
                "COALESCE(s.student_number, f.facilitator_id) AS userId, "
                "COALESCE(s.program, f.department) AS department "
                "FROM users u LEFT JOIN student_profile s ON s.user_id = u.id "
                "LEFT JOIN facilitator_profile f ON f.user_id = u.id ORDER BY u.created_at DESC"
            )
            return jsonify(users=cursor.fetchall())
        payload = json_body()
        full_name = str(payload.get("fullName") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        role = payload.get("role")
        password = payload.get("password")
        password_error = password_policy_error(password)
        if not full_name or len(full_name) > 150:
            return jsonify(error="Enter a name up to 150 characters."), 400
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
            return jsonify(error="Enter a valid email address."), 400
        if role not in ROLE_HOME or password_error:
            return jsonify(error=password_error or "Choose a valid role."), 400
        department = str(payload.get("department") or "").strip()
        if role == "Facilitator" and department not in FACILITATOR_DEPARTMENTS:
            return jsonify(error="Choose a valid facilitator department."), 400
        status = payload.get("status", "Active")
        if status not in {"Active", "Inactive", "Pending"}:
            return jsonify(error="Choose a valid account status."), 400
        user_id_value = str(payload.get("userId") or "").strip()
        if user_id_value and role in {"OJT Student", "Facilitator"}:
            column, table = (
                ("student_number", "student_profile")
                if role == "OJT Student"
                else ("facilitator_id", "facilitator_profile")
            )
            cursor.execute(f"SELECT user_id FROM `{table}` WHERE `{column}` = %s", (user_id_value,))
            if cursor.fetchone():
                return jsonify(error="That user ID is already assigned to an account."), 409
        cursor.execute(
            "INSERT INTO users (full_name, email, password_hash, role, status) VALUES (%s, %s, %s, %s, %s)",
            (full_name, email, generate_password_hash(password), role, status),
        )
        new_id = cursor.lastrowid
        if role == "OJT Student":
            cursor.execute(
                "INSERT INTO student_profile (user_id, student_name, student_number, program) VALUES (%s, %s, %s, %s)",
                (new_id, full_name, user_id_value or None, payload.get("department")),
            )
        elif role == "Facilitator":
            cursor.execute(
                "INSERT INTO facilitator_profile (user_id, facilitator_name, facilitator_id, department) VALUES (%s, %s, %s, %s)",
                (new_id, full_name, user_id_value or None, department),
            )
        connection.commit()
        return jsonify(message="Account created.", id=new_id), 201
    except Exception as error:
        connection.rollback()
        if getattr(error, "errno", None) == 1062:
            return jsonify(error="An account with this email is already registered."), 409
        app.logger.exception("User management operation failed")
        return jsonify(error="Unable to process accounts right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/users/<int:facilitator_id>/students", methods=["GET", "PUT"])
@require_role("Administrator")
def api_facilitator_students(facilitator_id):
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT u.id, u.full_name AS fullName, f.department "
            "FROM users u LEFT JOIN facilitator_profile f ON f.user_id = u.id "
            "WHERE u.id = %s AND u.role = 'Facilitator'",
            (facilitator_id,),
        )
        facilitator = cursor.fetchone()
        if not facilitator:
            return jsonify(error="Facilitator account not found."), 404
        if request.method == "GET":
            cursor.execute(
                "SELECT u.id, u.full_name AS fullName, p.student_number AS studentId, "
                "p.program AS department, "
                "EXISTS (SELECT 1 FROM facilitator_students fs "
                "WHERE fs.facilitator_user_id = %s AND fs.student_user_id = u.id) AS assigned "
                "FROM users u JOIN student_profile p ON p.user_id = u.id "
                "WHERE u.role = 'OJT Student' AND u.status = 'Active' "
                "ORDER BY p.program, p.student_number, u.full_name",
                (facilitator_id,),
            )
            return jsonify(facilitator=facilitator, students=cursor.fetchall())

        payload = json_body()
        student_ids = payload.get("studentIds")
        if not isinstance(student_ids, list) or any(
            isinstance(student_id, bool) or not isinstance(student_id, int) or student_id <= 0
            for student_id in student_ids
        ):
            return jsonify(error="Choose valid student accounts."), 400
        student_ids = list(dict.fromkeys(student_ids))
        if student_ids:
            placeholders = ", ".join(["%s"] * len(student_ids))
            cursor.execute(
                f"SELECT id FROM users WHERE role = 'OJT Student' AND status = 'Active' "
                f"AND id IN ({placeholders})",
                tuple(student_ids),
            )
            valid_ids = {student["id"] for student in cursor.fetchall()}
            if valid_ids != set(student_ids):
                return jsonify(error="One or more selected students are unavailable."), 400
        cursor.execute(
            "DELETE FROM facilitator_students WHERE facilitator_user_id = %s",
            (facilitator_id,),
        )
        if student_ids:
            cursor.executemany(
                "INSERT INTO facilitator_students (facilitator_user_id, student_user_id) VALUES (%s, %s)",
                [(facilitator_id, student_id) for student_id in student_ids],
            )
        connection.commit()
        return jsonify(message="Facilitator students updated.")
    except Exception:
        connection.rollback()
        app.logger.exception("Facilitator student assignments failed")
        return jsonify(error="Unable to update facilitator students right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.route("/api/users/<int:user_id>", methods=["PUT", "DELETE"])
@require_role("Administrator")
def api_user(user_id):
    admin = current_user()
    if admin is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    if request.method == "DELETE" and user_id == admin["id"]:
        return jsonify(error="You cannot delete your own administrator account."), 400
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT u.id, u.role, f.department FROM users u "
            "LEFT JOIN facilitator_profile f ON f.user_id = u.id WHERE u.id = %s",
            (user_id,),
        )
        existing = cursor.fetchone()
        if not existing:
            return jsonify(error="Account not found."), 404
        if request.method == "DELETE":
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            connection.commit()
            return jsonify(message="Account deleted.")
        payload = json_body()
        full_name = str(payload.get("fullName") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        role = payload.get("role")
        status = payload.get("status")
        if not full_name or len(full_name) > 150 or role not in ROLE_HOME or status not in {"Active", "Inactive", "Pending"}:
            return jsonify(error="Enter valid account details and status."), 400
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            return jsonify(error="Enter a valid email address."), 400
        department = str(payload.get("department") or "").strip()
        if role == "Facilitator" and department not in FACILITATOR_DEPARTMENTS:
            if existing["role"] != "Facilitator" or department != existing["department"]:
                return jsonify(error="Choose a valid facilitator department."), 400
        cursor.execute(
            "UPDATE users SET full_name = %s, email = %s, role = %s, status = %s WHERE id = %s",
            (full_name, email, role, status, user_id),
        )
        password = payload.get("password")
        if password:
            password_error = password_policy_error(password)
            if password_error:
                return jsonify(error=password_error), 400
            cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (generate_password_hash(password), user_id))
        if role == "OJT Student":
            cursor.execute(
                "INSERT INTO student_profile (user_id, student_name, program) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE student_name = VALUES(student_name), program = VALUES(program)",
                (user_id, full_name, department),
            )
        elif role == "Facilitator":
            cursor.execute(
                "INSERT INTO facilitator_profile (user_id, facilitator_name, department) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE facilitator_name = VALUES(facilitator_name), department = VALUES(department)",
                (user_id, full_name, payload.get("department")),
            )
        connection.commit()
        return jsonify(message="Account updated.")
    except Exception as error:
        connection.rollback()
        if getattr(error, "errno", None) == 1062:
            return jsonify(error="That email is already in use."), 409
        if getattr(error, "errno", None) == 1451:
            return jsonify(error="This account is linked to system records. Set it to Inactive instead of deleting it."), 409
        app.logger.exception("User update failed")
        return jsonify(error="Unable to update the account right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.get("/api/dashboard")
@require_role()
def api_dashboard():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        if user["role"] == "Administrator":
            cursor.execute("SELECT role, status, COUNT(*) AS count FROM users GROUP BY role, status")
            counts = cursor.fetchall()
            cursor.execute(
                "SELECT id, full_name AS fullName, email, role, status, "
                "DATE_FORMAT(created_at, '%Y-%m-%d') AS dateCreated "
                "FROM users ORDER BY created_at DESC LIMIT 10"
            )
            return jsonify(counts=counts, users=cursor.fetchall())
        cursor.execute(
            "SELECT COUNT(*) AS total, SUM(status = 'Verified') AS verified, "
            "SUM(status = 'Pending') AS pending, SUM(status IN ('Rejected', 'For Revision')) AS revision "
            "FROM documents d JOIN student_profile p ON p.id = d.student_id "
            + ("WHERE p.user_id = %s" if user["role"] == "OJT Student" else ""),
            (user["id"],) if user["role"] == "OJT Student" else (),
        )
        counts = cursor.fetchone()
        return jsonify(counts=counts)
    except Exception:
        app.logger.exception("Dashboard query failed")
        return jsonify(error="Unable to load dashboard data right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.get("/api/students")
@require_role("Facilitator", "Administrator")
def api_students():
    user = current_user()
    if user is None:
        return jsonify(error="Your session has expired. Sign in again."), 401
    connection = create_connection()
    if connection is None:
        return jsonify(error="The account service is unavailable."), 503
    cursor = None
    try:
        ensure_extended_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT u.id, p.student_number AS studentId, u.full_name AS fullName, "
            "p.program, i.company_name AS company, u.email, u.status "
            "FROM users u JOIN student_profile p ON p.user_id = u.id "
            "LEFT JOIN ojt_info i ON i.student_id = p.id "
            "WHERE u.role = 'OJT Student' "
            + (
                "AND EXISTS (SELECT 1 FROM facilitator_students fs "
                "WHERE fs.facilitator_user_id = %s AND fs.student_user_id = u.id) "
                if user["role"] == "Facilitator"
                else ""
            )
            + "ORDER BY u.full_name",
            (user["id"],) if user["role"] == "Facilitator" else (),
        )
        return jsonify(students=cursor.fetchall())
    except Exception:
        app.logger.exception("Student list query failed")
        return jsonify(error="Unable to load students right now."), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


@app.get("/role-assets/<role>/<path:filename>")
def role_asset(role, filename):
    folders = {"admin": BASE_DIR / "templates" / "admin copy", "facilitator": BASE_DIR / "templates" / "faci copy"}
    folder = folders.get(role)
    if folder is None:
        abort(404)
    return send_from_directory(folder, filename)


@app.get("/student/")
@app.get("/student")
@require_role("OJT Student")
def student_dashboard():
    return render_template("student_copy/index.html")


@app.get("/student/documents")
@require_role("OJT Student")
def student_documents():
    return render_template("student_copy/documents.html")


@app.get("/student/forms")
@require_role("OJT Student")
def student_forms():
    forms_dir = BASE_DIR / "static" / "student_copy" / "forms"
    forms = [{"number": path.stem.removeprefix("ojt_form"), "filename": path.name}
             for path in sorted(forms_dir.glob("ojt_form*.pdf"))]
    return render_template("student_copy/forms.html", forms=forms)


@app.get("/student/notifications")
@require_role("OJT Student")
def student_notifications():
    return render_template("student_copy/notification.html")


@app.get("/student/ojt-info")
@require_role("OJT Student")
def student_ojt_info():
    return render_template("student_copy/ojt-info.html")


@app.get("/student/privacy-policy")
@require_role("OJT Student")
def student_privacy_policy():
    return render_template("student_copy/privacy-policy.html")


@app.get("/student/profile")
@require_role("OJT Student")
def student_profile():
    return render_template("student_copy/profile.html")


@app.get("/student/settings")
@require_role("OJT Student")
def student_settings():
    return render_template("student_copy/settings.html")


@app.get("/admin/")
@app.get("/admin")
@require_role("Administrator")
def admin_dashboard():
    return render_template("admin copy/index.html")


@app.get("/admin/<page>")
@require_role("Administrator")
def admin_page(page):
    allowed = {"user-management.html", "create-account.html", "forms.html", "privacy-policy.html"}
    if page not in allowed:
        abort(404)
    return render_template(f"admin copy/{page}")


@app.get("/facilitator/")
@app.get("/facilitator")
@require_role("Facilitator")
def facilitator_dashboard():
    return render_template("faci copy/dashboard.html")


@app.get("/facilitator/<page>")
@require_role("Facilitator")
def facilitator_page(page):
    allowed = {"dashboard copy.html", "documents.html", "forms.html", "notification.html", "ojt-students.html", "privacy-policy.html", "profile.html", "settings.html"}
    if page not in allowed:
        abort(404)
    return render_template(f"faci copy/{page}")


if __name__ == "__main__":
    app.run(debug=DEBUG)
