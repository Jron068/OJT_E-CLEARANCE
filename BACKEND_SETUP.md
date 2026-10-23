# Flask, MySQL, and portal setup

The student, facilitator, and administrator portals use the database selected by `DB_NAME` (defaults to `ojt_db`) for accounts, profiles, OJT details, documents, downloadable forms, settings, and role-targeted notifications. Passwords are stored as Werkzeug hashes. Uploaded documents and images are stored under `instance/uploads` and served only from authenticated routes.

1. Install dependencies: `python -m pip install -r requirements.txt`.
2. Run the complete `schema.sql` in MySQL. It creates/selects `ojt_db` and defines the users, student and facilitator profiles, forms, notifications, notification recipients, settings, documents, and OJT information tables. Set `DB_NAME=ojt_db` for the supplied schema, or adjust the schema script if using another database. `CREATE TABLE IF NOT EXISTS` does not alter existing tables. On the first authenticated request after restarting Flask, the app also migrates the legacy `users.full_name` column and adds the new optional profile/OJT fields and supporting tables. The configured MySQL account therefore needs `ALTER` and `CREATE` privileges during that migration. Back up existing data before schema changes.

3. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `FLASK_SECRET_KEY` before starting Flask. Use a long random secret key and do not commit credentials.
4. Accounts for students and facilitators are created by an authenticated administrator through the admin account-creation page. Account passwords must be at least 9 characters including uppercase, lowercase, and a special character, and duplicate email addresses are rejected. Select one of these facilitator departments: Information Technology, Computer Science, Accounting, Education, or Psychology. Create the initial administrator through a trusted database administration process with a password hash. Generate a hash with:

   ```sh
   python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('replace-with-a-strong-password'))"
   ```

   Insert the resulting hash in `users.password_hash` with role `Administrator` and status `Active`. Never store the password itself.
5. In User Management, use the facilitator assignment button to link each facilitator to their students. Search by student name or ID and use the department filter to make assignments. Facilitator-uploaded forms and their notifications are available only to students assigned to that facilitator.
6. Start the app with `python app.py`.

The login response redirects users to the dashboard for their database role. Newly created students and facilitators can sign in with the credentials provided by the administrator. Document and form uploads are limited to 10 MB. Back up the MySQL database and `instance/uploads` together so records and stored files remain consistent.
