# 🛡️ Attendify-v2: Advanced Attendance Ecosystem

Attendify-v2 is a high-performance, Next.js 15-powered attendance management system featuring real-time Smartboard synchronization, GPS-validated scanning, and multi-role administrative controls.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20 or higher
- **Firebase Account**: A project configured with Firestore and Authentication.
- **Environment**: A `.env.local` file in the root directory.

### 2. Installation
```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install
```

### 3. Environment Configuration 🔑
Create a file named `.env.local` in the root and fill in your Firebase credentials.

```env
# --- PUBLIC FIREBASE KEYS ---
NEXT_PUBLIC_FIREBASE_API_KEY=enter_your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=enter_your_auth_domain_here
NEXT_PUBLIC_FIREBASE_PROJECT_ID=enter_your_project_id_here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=enter_your_storage_bucket_here
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=enter_your_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=enter_your_app_id_here

# --- SERVER-SIDE FIREBASE ADMIN KEYS ---
FIREBASE_PROJECT_ID=enter_your_project_id_here
FIREBASE_CLIENT_EMAIL=enter_your_client_email_here
FIREBASE_PRIVATE_KEY="enter_your_private_key_here_with_quotes"
```

---

## 📘 User Manual: Step-by-Step Guide

### Phase 1: Initial System Deployment
1.  **Configure Admin**: Open `scripts/seed-admin.mjs` and update the email/password in the last line.
2.  **Run Seed Script**:
    ```bash
    node scripts/seed-admin.mjs
    ```
    This creates your first Master Admin account in both Firebase Auth and Firestore.

### Phase 2: Academic Infrastructure Setup
1.  **Login**: Go to `/login` and use your Admin credentials.
2.  **Dashboard Settings**: Navigate to **Settings** in the sidebar.
3.  **Define Branches**: Add your departments or branches (e.g., Computer Science, Mechanical).
4.  **Add Subjects**: Under each branch, add the subjects.
5.  **Configure Sections**: Define the sections/semesters for each branch.

### Phase 3: User & Timetable Management
1.  **Create Teachers/Students**: Navigate to the **Users** tab.
    -   *Admin* can create Teachers and Students.
    -   *Teachers* can only create Students.
2.  **Configure Timetable**: Go to the **Timetable** tab.
    -   Select Branch and Semester.
    -   Add class slots (Subject, Teacher, Time, Room).

### Phase 4: Smartboard Operations (Teacher)
1.  **Initiate Session**: Open the **Smartboard** page.
2.  **Select Class**: The system auto-detects current classes. Select the active session.
3.  **Display QR**: A unique QR code will be generated with a 120-second timer.
4.  **Monitor Real-time**: As students scan, their names appear instantly on the grid.
    -   **Green**: Present (Valid Location)
    -   **Yellow**: Proxy (Location Mismatch/Mock GPS)
    -   **Red**: Absent

### Phase 5: Student Scanning
1.  **Open Scanner**: Student logs in and goes to the **Scan** tab.
2.  **Grant Permissions**: Allow Camera and Location access.
3.  **Scan QR**: Point the camera at the Smartboard QR.
4.  **Confirmation**: The student is instantly marked present on the teacher's screen.

---

## 🛠️ Development Commands

| Command | Action |
| :--- | :--- |
| `npm run dev` | Start development server at localhost:3000 |
| `npm run build` | Build the application for production |
| `npm run start` | Run the built production server |
| `npm run lint` | Run ESLint for code quality checks |

---

## 🎨 UI/UX Philosophy
- **Cyber-Noir Aesthetic**: Dark theme with high-contrast glassmorphism.
- **Mobile First**: Fully responsive scanning and dashboard views.
- **Real-time**: Powered by Firestore listeners for zero-latency updates.

---

## 📄 Documentation
For detailed developer logs and latest updates, refer to `docs/CONTEXT.md`.
