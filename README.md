# 🥋 OPC UA Dojo - Industrial IoT Gateway

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)
![React](https://img.shields.io/badge/react-v18-blue)
![Siemens](https://img.shields.io/badge/Hardware-S7--1500-teal)

> **Bridging the gap between Modern Web (React) and Industrial Automation (Siemens S7-1500).**

Welcome to the **OPC UA Dojo**. This project is a "Proof of Concept" designed to demonstrate how modern web technologies can interact securely and efficiently with industrial hardware.

It is not just a standard OPC UA client: it is a **Reactive Explorer** that allows you to manipulate complex data types and natively integrate **WinCC Unified** HMI panels.

![Project Screenshot](https://i.ibb.co/tprGGL8T/bild.png)


## ✨ Key Features

- **🔒 "Trust On First Use" (TOFU) Security:** Strict implementation of the X.509 standard. No shortcuts: supports only *SignAndEncrypt* connections.
- **⚡ Real-time Data Handling:** Read/Write complex structures like **Boolean Arrays**, **Integers**, and intelligent handling of **Char/Byte** types (automatic ASCII conversion).
- **🩹 Siemens "Ghost" Patch:** Custom backend algorithm that forcibly injects global DataBlocks (e.g., `Datenbaustein_1`) that TIA Portal sometimes hides during standard browsing.
- **📦 Dynamic Dashboard:** Ability to move tags from the navigation tree to an active monitoring container ("Watchlist") for side-by-side analysis.
- **🖥️ WinCC Unified Launcher:** A dedicated system to launch WebRH HMI sessions while bypassing modern browser security restrictions (CORS/Cookie policies).

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS (Glassmorphism UI).
- **Backend:** Node.js, Express, Socket.io.
- **Protocol:** [node-opcua](https://github.com/node-opcua/node-opcua) (The heartbeat of this project).
- **Target Hardware:** Siemens S7-1500 (Physical or PLCSIM Advanced).

---

## 🚀 Installation Guide

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v16 or higher).
* A Siemens S7-1500 PLC (or PLCSIM Advanced) with the OPC UA Server active.

### 2. Clone & Install
Clone the repository and install dependencies for both the server (Backend) and client (Frontend).

```bash
# 1. Clone the project
git clone [https://github.com/RandomCreator91/opcua-dojo.git](https://github.com/RandomCreator91/opcua-dojo.git)
cd opcua-dojo

# 2. Install Backend dependencies (Root)
npm install

# 3. Install Frontend dependencies (Client)
cd client
npm install
cd ..
