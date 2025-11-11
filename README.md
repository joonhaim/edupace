# 🫀 EduPace — External Pacemaker Training Simulator

**EduPace** is an educational simulator that trains nurses and students to configure a **temporary external single-chamber pacemaker** safely and realistically.  
It allows users to practice pacing, sensing, and threshold adjustments **without patient risk**.

Developed within the **TU Delft Minor Biomedical Engineering (2025)** in collaboration with the **Reinier de Graaf Hospital (Delft)**, this version builds upon the **2024 prototype (Group 8)** with new hardware, improved ECG realism, and a redesigned interface.

---

## 🔧 Overview

EduPace replicates the functions of the **Medtronic 53401 Temporary External Pacemaker** through a combination of:

- 🖥️ **Software simulator** with real-time ECG visualization  
- ⚙️ **Physical control unit** with functional knobs, LEDs, and display  

Together they create a realistic environment to train on **rate, output, and sensitivity** adjustments, threshold finding, and pacing modes.

---

## 🎯 Project Objectives

- Upgrade hardware to **Arduino GIGA R1 WiFi** + **GIGA Display Shield**  
- Develop modular software for flexible scenarios and ECG generation  
- Simulate **intrinsic rhythms**, **PVCs/PACs**, **loss of capture**, and **mal-sensing**  
- Add **visual + auditory feedback** for user errors and alarms  
- Enable **data logging** for training review and progress tracking  

---

## 🧠 System Concept

EduPace integrates two main components:

| Component | Function |
|------------|-----------|
| **Hardware unit** | Knobs for *Rate*, *Output*, *Sensitivity* + LED feedback (Pace / Sense / Async) |
| **Software interface** | ECG display + scenario menu + error and threshold feedback |

The system communicates via serial USB, reproducing real-time pacing responses similar to the Medtronic 53401.

---

## 💡 Training Features

- Adjustable pacing modes: **VVI** and **VOO**  
- Adjustable parameters with visible numeric feedback  
- ECG variations (bradycardia, asystole, PVCs, PACs)  
- **Capture and sensing** threshold training  
- Visual error alerts (e.g., pacing on T-wave → red screen)  
- **Sound and alarm feedback** for realistic clinical simulation  

---

## 🧩 Development Roadmap

| Stage | Focus | Key Deliverables |
|--------|--------|-----------------|
| ✅ **Prototype 2024** | Proof of concept (Medtronic 53401 copy) | Arduino Mega + PC interface |
| 🔄 **Upgrade 2025** | Hardware and ECG improvement | GIGA R1 + Display Shield, new UI |
| 🚀 **Next Steps** | Clinical usability + data logging | Nurse evaluation + scenario expansion |

---

## 🧰 Hardware

- **Arduino GIGA R1 WiFi**
- **Arduino GIGA Display Shield**
- Rotary encoders × 3  
- RGB LEDs × 3  
- Piezo buzzer (for alarms)  
- 3D-printed housing based on Medtronic 53401 layout  

---

## 💻 Software

- **Language:** C++ / Arduino IDE  
- **Architecture:** multi-threaded ECG simulation (Heart logic + ECG + Pacemaker)  
- **Display:** real-time ECG visualization with interactive feedback  
- **Communication:** Serial data exchange for knob and LED control  


---

## 👥 Contributors

- **Minor BME 2025 Team:**  
- **Reinier de Graaf Hospital:** Paul Verschuren (Clinical Supervisor)  
- **TU Delft Faculty of Mechanical Engineering**

---

## ⚠️ Disclaimer

EduPace is **for educational use only** and is **not a medical device**.

---
