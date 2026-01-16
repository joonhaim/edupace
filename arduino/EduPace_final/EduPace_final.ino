/*============================================================
  EduPace 2025
  Hardware: Arduino GIGA R1 + GIGA Display Shield
  Serial Baud Rate: 115200
  ------------------------------------------------------------
  COMMUNICATION FORMAT
  ------------------------------------------------------------
  ► Incoming Serial Commands:
    GREEN_ON   / GREEN_OFF
    BLUE_ON    / BLUE_OFF

  ► Outgoing Serial Messages:
    PACE=<value>, OUTPUT=<value>, SENSE=<value>
    POWER_ON
    POWER_OFF
    LOCK_ON
    LOCK_OFF
  ------------------------------------------------------------
  USER INTERACTION
  ------------------------------------------------------------
  ► Power Button:
    – Hold > 2 seconds  → Toggle ON → OFF
    – Short press  → Toggle OFF → ON
    – ignored when locked

  ► Key Button:
    – Single press      → Lock / Unlock 

  ► Encoder Knobs:
    – Rotate to adjust PACE, OUTPUT, or SENSE
    – Rotation ignored when locked
  ------------------------------------------------------------
  Notes:
  – Display UI uses LVGL
  ============================================================ 
*/

#include "lvgl.h" //LVGL graphics library for buttons etc.
#include "Arduino_H7_Video.h"  //controls GIGA display
#include "Arduino_GigaDisplayTouch.h" //reads touch input
#include "lv_conf.h" 
#include <math.h> // needed for isnan()

LV_IMG_DECLARE(key);
LV_IMG_DECLARE(tu_logo_img)
LV_IMG_DECLARE(edupace_logo_img)
LV_IMG_DECLARE(edupace_logo_small_img)
LV_FONT_DECLARE(digital)

Arduino_H7_Video          Display(480, 800, GigaDisplayShield); 
Arduino_GigaDisplayTouch  TouchDetector;

//Splash screen
bool appStarted = false;

lv_obj_t * splash_scr;
lv_obj_t * main_scr;
lv_obj_t * start_btn;

//Lock button 
unsigned long lastChangeTime = 0; // time of last pace/output/sense change
const unsigned long autoLockInterval = 60000; // 60 seconds in milliseconds

bool key_pressed = false; 
bool autoLocked = false;

//Power button
bool power_pressed = false;
unsigned long powerBtnPressTime = 0;          // long press timestamp
const unsigned long powerHoldDuration = 2000; // 2 seconds hold

//Led States
bool greenState = false;  // current state of green LED
bool blueState  = false;  // current state of blue LED

//Encoder values (Default values: Pace 80, output 10, sensen 2.0)
float pace = 80;
float output = 10;
float sense = 2.0;

// For serial transmission of updated values
float lastPace = -1;
float lastOutput = -1;
float lastSense = -1;

//Indexes 
int paceIndex = 19;
int outputIndex = 19;
int senseIndex = 5;

//Steps for lookup tables 
const int paceSteps = 50;
const int outputSteps = 35;
const int senseSteps = 21;

lv_obj_t * cont;   //main container

// Pin definitions
#define inputA1 2
#define inputB1 3
#define inputA2 6
#define inputB2 7
#define inputA3 12
#define inputB3 13

// Rotary State
int AState1, ALastState1;
int AState2, ALastState2;
int AState3, ALastState3;

void setup() {
  Serial.begin(115200);
  lv_init();

  Display.begin();
  TouchDetector.begin();

  showSplashScreen();  
}

void loop() {
  if (appStarted) {
    updateEncoders();
    updateDisplayLabels();
    updateDial();

    sendUpdatedValues();
    handleSerialSignals();

    updateLeds();
    checkAutoLock();
  }
  lv_timer_handler();
  delay(5);
}

