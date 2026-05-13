# Attendify-v2: Premium System Architecture & Flow

This documentation presents the Attendify-v2 ecosystem through a high-fidelity technical infographic and detailed logical breakdowns.

## 1. System Infographic (Premium Version)
![Attendify Infographic Flow](file:///a:/Attendify/Attendify-v2/docs/infographic_flow.png)

---

## 2. Strategic Module Breakdown

### I. Security Matrix (The Gatekeeper)
*   **GPS Geofencing**: Real-time spatial validation ensuring the user is within the designated classroom coordinates (Haversine Algorithm).
*   **Mock Location Probe**: Deep-packet inspection of location provider flags to eliminate GPS spoofing.
*   **Pulse QR Token**: A high-entropy temporal token that expires and regenerates every 10 seconds to prevent "Photo Proxying".

### II. Academic Registry (The Intelligence)
*   **Dynamic Prefix Detection**: Automated extraction of branch and enrollment year from student registration IDs.
*   **Batch Mapping Engine**: Maps thousands of students into discrete **Sections** and **Groups** based on predefined roll number ranges in Firestore.
*   **Metadata Synchronization**: Seamlessly links student IDs to attendance sessions without manual data entry.

### III. Live Session (The Execution)
*   **Smartboard Orchestration**: Centralized display for QR codes, attendance grids, and real-time statistics.
*   **Session Lifecycle**: Automates the lifecycle from initialization to closure (120s timer).
*   **Teacher Control Plane**: Provides manual override capabilities and status filtering (Present/Proxy/Absent).

### IV. Cloud Infrastructure (The Backbone)
*   **Firebase Persistence**: Distributed NoSQL data storage for users, sessions, and academic logs.
*   **Sub-100ms Sync**: WebSocket-based push notifications ensure the Smartboard updates instantly as soon as a student scans.

---

## 3. Other Visual References
- **[Detailed Technical Flowchart](file:///a:/Attendify/Attendify-v2/docs/detailed_flowchart_v2.png)** (Logic focus)
- **[Standard Engineering Flowchart](file:///a:/Attendify/Attendify-v2/docs/standard_flowchart.png)** (Symbols focus)
- **[Presentation Slide Version](file:///a:/Attendify/Attendify-v2/docs/presentation_flow.png)** (Clean UI focus)
- **[Creative High-Fidelity Version](file:///a:/Attendify/Attendify-v2/docs/high_fidelity_flow.png)** (Aesthetic focus)

---

## 4. Technical Specifications
- **Core**: Next.js 15 (App Router)
- **Database**: Firebase Firestore (Real-time SDK)
- **Security**: RBAC + GPS Geofencing + Mock Location Detection
- **Styling**: Tailwind CSS v4 + Cyber-Noir Aesthetics
