# 🫀 EduPace — External Pacemaker Training Simulator

**EduPace** is a biomedical training tool designed to simulate the configuration of an external single-chamber pacemaker.  
It allows nurses and students to safely practice setting pacing parameters without any patient risk.

This version is developed as part of the **TU Delft Minor Biomedical Engineering (2025)** in collaboration with the **Reinier de Graaf Hospital (Delft)**.  
It builds upon the 2024 prototype (Group 8) with new hardware and a redesigned, more intuitive software interface.

---

## 🔧 Overview

EduPace combines a **physical simulator** and a **computer-based interface** to replicate the functions of the **Medtronic 53401 Temporary External Pacemaker**.

The system provides:

- Realistic control of *Rate*, *Output*, and *Sensitivity*  
- Dynamic ECG visualization reacting to pacing behavior  
- Visual and auditory feedback for pacing events and errors  
- A safe environment for nurses to maintain device familiarity  

---

## 🧩 Project Goals

- Upgrade hardware to the **Arduino GIGA R1 WiFi** and **GIGA Display Shield**  
- Redesign software for intuitive, modular use  
- Simulate realistic ECG responses including pacing, capture, and sensing events  
- Add visual and sound feedback for training realism  
- Enable training session tracking and future data logging  

---

## 🧠 System Concept

EduPace integrates hardware control and real-time ECG visualization:

