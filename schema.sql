CREATE DATABASE IF NOT EXISTS ojt_db;
USE ojt_db;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Administrator', 'Facilitator', 'OJT Student') NOT NULL,
    status ENUM('Active', 'Inactive', 'Pending') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_profile (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    student_name VARCHAR(150) NOT NULL,
    student_number VARCHAR(80),
    program VARCHAR(150),
    year_level VARCHAR(50),
    contact_number VARCHAR(20),
    emergency_number VARCHAR(30),
    address VARCHAR(255),
    photo_url VARCHAR(255),
    CONSTRAINT fk_student_profile_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS facilitator_profile (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    facilitator_name VARCHAR(150) NOT NULL,
    facilitator_id VARCHAR(80),
    department VARCHAR(150),
    contact_number VARCHAR(30),
    address VARCHAR(255),
    emergency_number VARCHAR(30),
    position VARCHAR(120),
    photo_url VARCHAR(255),
    signature_url VARCHAR(255),
    CONSTRAINT fk_facilitator_profile_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS facilitator_students (
    facilitator_user_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (facilitator_user_id, student_user_id),
    CONSTRAINT fk_facilitator_students_facilitator FOREIGN KEY (facilitator_user_id)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_facilitator_students_student FOREIGN KEY (student_user_id)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forms (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_by BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    file_url VARCHAR(255) NOT NULL,
    audience VARCHAR(30) NOT NULL DEFAULT 'All',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_forms_created_by FOREIGN KEY (created_by)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_by BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT 'Notification',
    sent_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    message TEXT NOT NULL,
    file_url VARCHAR(255),
    KEY idx_notifications_date (sent_date),
    CONSTRAINT fk_notifications_created_by FOREIGN KEY (created_by)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS notification_recipients (
    notification_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    PRIMARY KEY (notification_id, user_id),
    CONSTRAINT fk_notification_recipient_notification FOREIGN KEY (notification_id)
        REFERENCES notifications(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_notification_recipient_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    username VARCHAR(150),
    recovery_email VARCHAR(254),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    date_uploaded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    title VARCHAR(200) NOT NULL,
    status ENUM('Pending', 'Verified', 'Rejected', 'For Revision') NOT NULL DEFAULT 'Pending',
    file_url VARCHAR(255),
    reviewed_by BIGINT UNSIGNED,
    reviewed_at TIMESTAMP NULL,
    review_notes TEXT,
    KEY idx_documents_status (status),
    KEY idx_documents_date (date_uploaded),
    CONSTRAINT fk_documents_student FOREIGN KEY (student_id)
        REFERENCES student_profile(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ojt_info (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL UNIQUE,
    company_name VARCHAR(200) NOT NULL,
    program VARCHAR(150) NOT NULL,
    contacts VARCHAR(255),
    required_hours INT,
    ojt_period VARCHAR(120),
    CONSTRAINT fk_ojt_info_student FOREIGN KEY (student_id)
        REFERENCES student_profile(id) ON UPDATE CASCADE ON DELETE CASCADE
);
