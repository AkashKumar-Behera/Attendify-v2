# 🛡️ Attendify v2: Advanced Attendance Ecosystem

Attendify v2 is a high-performance, real-time attendance management system designed for academic environments. Built with **Next.js 15** and **Firebase**, it eliminates manual marking and fraud through dynamic security protocols and a premium "Cyber-Noir" aesthetic.

---

## ✨ Key Features

*   **Smartboard Integration**: Real-time synchronization of student scans using Firebase `onSnapshot` for sub-100ms updates.
*   **Anti-Fraud Engine**: 
    *   **GPS Geofencing**: Validates student location within a 50m radius of the classroom.
    *   **Mock Detection**: Advanced detection of GPS spoofing and historical data correlation.
*   **Dynamic QR Protocol**: Secure QR codes that refresh every 5 seconds to prevent "photo-sharing" proxies.
*   **Automated Timetable**: Intelligent subject detection based on a centralized academic registry.
*   **Cyber-Noir UI**: A premium, state-of-the-art interface featuring glassmorphism, glowing borders, and Framer Motion animations.

## 🚀 Tech Stack

*   **Core**: Next.js 15 (App Router), TypeScript
*   **Database**: Firebase Firestore (Real-time SDK)
*   **Security**: Firebase Auth (Role-Based Access Control: Admin, Teacher, Student)
*   **Styling**: Tailwind CSS v4, Framer Motion, Lucide Icons

---

## 📊 System Architecture

For a detailed technical breakdown of the system logic, security matrix, and session lifecycle, please refer to the visual documentation:

👉 **[View System Flowcharts](./docs/FLOWCHART.md)**

---

## 🛠️ Getting Started

### 1. Installation
```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install
```

### 2. Environment Configuration 🔑
Create a file named `.env.local` in the root and fill in your Firebase credentials exactly as shown below:

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

### 3. Run Development Server
```bash
npm run dev
```

---

## 📘 User Manual: Step-by-Step Guide

### Phase 1: Initial System Deployment
1.  **Configure Admin**: Open `scripts/seed-admin.mjs` and update the email/password.
2.  **Run Seed Script**: `node scripts/seed-admin.mjs`. This creates the Master Admin.

### Phase 2: Academic Infrastructure
1.  **Login**: Access `/login` with Admin credentials.
2.  **Setup**: Define Branches, Subjects, and Sections in the **Settings** dashboard.
3.  **Mapping**: Configure Roll Number prefixes for automated metadata resolution.

### Phase 3: Smartboard Operations (Teacher)
1.  **Initiate**: Open the **Smartboard** page.
2.  **Scan**: The dynamic QR appears. As students scan, their names appear instantly:
    *   🟢 **Present**: Valid scan & location.
    *   🟡 **Proxy**: Scan detected but location failed/mock GPS found.
    *   🔴 **Absent**: Not scanned.

---

## 📖 Development Workflow

Agents and developers MUST maintain the `docs/CONTEXT.md` file as a shared memory log.
*   **Pre-task**: Read `docs/CONTEXT.md` for latest state.
*   **Post-task**: Update with: `[YYYY-MM-DD HH:MM] | Agent: [Name] | Task: [Summary] | Status: [Done]`.

---

## 📄 License
This project is for academic and presentation purposes. All rights reserved.
