# CodeX - Virtual Classroom Platform

CodeX is a high-performance, real-time virtual classroom and collaboration platform designed to bridge the gap between teachers and students with cutting-edge technology. Built with React, Bun, and Google's Gemini AI, it provides a seamless, interactive learning experience.

## 🚀 Key Features

- **AI-Powered Session Summarization**: Automatically generate concise summaries of classroom sessions using Google Gemini AI, helping students review key points efficiently.
- **Real-Time Board Sharing**: Teachers can capture and share specific areas of their screen or whiteboard (ROI-based) with students in real-time.
- **Interactive Avatars**: Integrated face tracking using MediaPipe technology to power real-time avatars, enhancing engagement.
- **Low-Latency Audio**: High-quality, real-time audio communication powered by WebRTC and custom relay services.
- **Teacher & Student Roles**:
  - **Teacher Interface**: Control board sharing, manage sessions, and view AI-generated summaries.
  - **Student Interface**: View the live board, listen to high-quality audio, and participate in a synchronized learning environment.

## 🛠️ Technology Stack

### Frontend (Client)
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS & Shadcn UI
- **State Management**: Zustand & React Query
- **AI/CV**: MediaPipe Face Mesh, Camera Utils, Drawing Utils and FOMM for avatar tracking, and integration with Google Gemini API
- **Board Sharing**: Canvas API with ROI-based patching and YOLOv5 for object detection (future enhancement)
- **Communication**: WebSockets (Signaling) & WebRTC (Audio)

### Backend (Server)
- **Runtime**: Bun
- **Framework**: Express (Node.js compatibility)
- **Real-time**: Custom WebSocket implementation (`ws`)
- **AI Integration**: Google Gemini API for summarization
- **WebRTC**: Custom Signaling and Peer Management

## 📦 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (Recommended runtime)
- Node.js (v18+)
- Google Gemini API Key

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd CodeX
   ```

2. **Setup Server**:
   ```bash
   cd server
   bun install
   ```
   Create a `.env` file in the `server` directory and add your Gemini API Key:
   ```env
   PORT=3000
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Setup Client**:
   ```bash
   cd ../client
   npm install # or bun install
   ```

### Running the Application

1. **Start the Server**:
   ```bash
   cd server
   bun dev
   ```

2. **Start the Client**:
   ```bash
   cd client
   npm run dev
   ```

The application will be available at `http://localhost:5173` (default Vite port), and the server will be running on `http://localhost:3000`.

## 📂 Project Structure

- `/client`: React frontend application.
- `/server`: Bun-based WebSocket and signaling server.
- `/server/ws`: WebSocket message handlers (Audio, Avatar, Board, etc.).
- `/server/webrtc`: WebRTC peer management and audio relay logic.

## 🤝 Team
Developed with passion by **Team CodeX**.
