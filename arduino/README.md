# EduPace Hardware 

## Hardware Requirements 
 - Arduino Giga R1
 - Giga Display Shield (480×800)
 - 3 Incremental Rotary Encoders (for Pace, Output, and Sense)

## Software Requirements

- Arduino IDE 
- LVGL graphics library (9.4.0)
- Arduino_H7_Video library
- Arduino_GigaDisplayTouch library
- Download digital.c file and add it inside the font folder of Arduino "C:\..\..\..\Arduino\libraries\lvgl\src\font\digital.c"

## Features

- Touch-enabled lock button
- Touch-enabled power button
- Real-time display of Pace, Output, and Sense parameters
- Rotary encoder input for adjusting values
- LED indicators for status feedback
- Serial communication for external monitoring/control
- Graphical dials and digital readouts for parameter visualization
- Flickering LED effect to simulate device activity

## Serial Communication
- Setial Baud rate: 115200
### Communication Format
► Incoming Serial Commands:
- GREEN_ON
- GREEN_OFF
- BLUE_ON
- BLUE_OFF
  
► Outgoing Serial Messages:
- PACE=< value >, OUTPUT=< value >, SENSE=< value >
- POWER_ON
- POWER_OFF

### User Interaction
► Power Button:
   - Hold > 2 seconds  → Toggle ON → OFF
   - Single press      → Toggle OFF → ON
   - ignored when locked
     
► Key Button:
- Single press  → Lock / Unlock
- If no value (pace, output, sense) has changed for more than 60 seconds, the system automatically locks.
  
► Encoder Knobs:
- Rotate to adjust PACE, OUTPUT, or SENSE
- Rotation ignored when locked
   
## Pin Connections
| Component    | Signal   | Arduino Pin | Notes                 |
|-------------|---------|------------|----------------------|
| ENCODER 1   | CLK (A) | 2          | Pace rotary encoder   |
| ENCODER 1   | DT (B)  | 3          | Pace rotary encoder   |
| ENCODER 2   | CLK (A) | 6          | Output rotary encoder |
| ENCODER 2   | DT (B)  | 7          | Output rotary encoder |
| ENCODER 3   | CLK (A) | 12         | Sense rotary encoder  |
| ENCODER 3   | DT (B)  | 13         | Sense rotary encoder  |
| Power       | +5V     | +5V        | Supply voltage        |
| Ground      | GND     | GND        | Common ground         |
  
