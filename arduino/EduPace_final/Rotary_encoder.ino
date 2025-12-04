/*Rotary Encoders 

Encoder 1 (pace): 30 35 40 45 50 52 54 56 58 60 62 64 66 68 70 72 74 76 78 80 82 84 86 88 90 92 94 96 98 100 105 110 115 120 125 130 135 140 145 150 155 160 165 170 175 180 185 190 195 200  
Encoder 2 (output): 0.1 0.2 0.3 0.4 0.6 0.8 1 1.5 2 2.5 3 3.5 4 4.5 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25
Encoder 3 (sense): 0.4 0.6 0.8 1 1.5 2 2.5 3 4 5 6 7 8 9 10 12 14 16 18 20 ASYNC

Clockwise rotation: (when B != A)
A:  _|‾‾|__|‾‾|__           A: 0-> 1  
B:    _|‾‾|__|‾‾|__         B: 0

Counter-clockwise rotation (when B == A)
A:    _|‾‾|__|‾‾|__         A: 0->1
B:  _|‾‾|__|‾‾|__           B: 1

*/

/*PIN Connections

GLOBAL
GND         -> GND (black)
+           -> 5V (red)

ENCODER 1
B DT (data)   -> digital pin (3) (blue)
A CLK (clock) -> digital pin (2) (yellow)

ENCODER 2
B DT (data)   -> digital pin (7) (green)
A CLK (clock) -> digital pin (6) (orange)

ENCODER 3
B DT (data)   -> digital pin (13) (gray)
A CLK (clock) -> digital pin (12) (white)*/

//Lookup Tables
const float paceTable[] = {
  30,35,40,45,50,52,54,56,58,60,62,64,66,68,70,72,
  74,76,78,80,82,84,86,88,90,92,94,96,98,100,105,110,
  115,120,125,130,135,140,145,150,155,160,165,170,175,180,
  185,190,195,200
};

const float outputTable[] = {
  0.1,0.2,0.3,0.4,0.6,0.8,1,1.5,2,2.5,3,3.5,4,4.5,5,
  6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25
};

const float senseTable[] = {
  0.4,0.6,0.8,1,1.5,2,2.5,3,4,5,6,7,8,9,10,12,14,16,18,20
};


void setupEncoders(){

  pinMode (inputA1, INPUT_PULLUP);
  pinMode (inputB1, INPUT_PULLUP);

  pinMode (inputA2, INPUT_PULLUP);
  pinMode (inputB2, INPUT_PULLUP);

  pinMode (inputA3, INPUT_PULLUP);
  pinMode (inputB3, INPUT_PULLUP);
  
  Serial.begin (115200);

  //Initialize previous states 
  ALastState1 = digitalRead(inputA1);
  ALastState2 = digitalRead(inputA2);
  ALastState3 = digitalRead(inputA3);
}

void updateEncoders(){

  if (!power_pressed){
    return;
  }

  //Encoder 1 - Pace
  AState1 = digitalRead(inputA1); //is pinA high or low now?
  if (AState1 != ALastState1){ //is there a change? low->high or high>low

    if (!key_pressed && power_pressed && !autoLocked){
      float oldPace = pace;
      if (digitalRead(inputB1) != AState1) {
        if (paceIndex < paceSteps -1){
          paceIndex++; //clockwise
        }
      }

      else{
        if (paceIndex > 0){
          paceIndex--; //counter-clockwise 
        }
      }

      pace = paceTable[paceIndex]; //update when the key is not pressed 
      if (pace != oldPace) lastChangeTime = millis(); // update timer on change
    }
  }
  ALastState1 = AState1;

  //Encoder 2 - Output
  AState2 = digitalRead(inputA2);
  if (AState2 != ALastState2) {

    if (!key_pressed && power_pressed && !autoLocked){
      float oldOutput = output;
      if (digitalRead(inputB2) != AState2){
        if (outputIndex < outputSteps - 1)
          outputIndex++;
      }

      else{
        if (outputIndex > 0)
          outputIndex--;
      }

      output = outputTable[outputIndex];
      if (output != oldOutput) lastChangeTime = millis(); // update timer on change
    }
  }
  ALastState2 = AState2;

  //Encoder 3 - Sense
  AState3 = digitalRead(inputA3);
  if (AState3 != ALastState3) {

    if(!key_pressed && power_pressed && !autoLocked){
      float oldSense = sense;
      if (digitalRead(inputB3) != AState3){
        if (senseIndex < senseSteps - 1)
          senseIndex++;
      }

      else {
        if (senseIndex > 0)
          senseIndex--;
      }

      if (senseIndex == senseSteps - 1 ){
        sense = NAN;
      }
      else {
        sense = senseTable[senseIndex];
        lastChangeTime = millis();
      }
    }
  }
  ALastState3 = AState3;
}






