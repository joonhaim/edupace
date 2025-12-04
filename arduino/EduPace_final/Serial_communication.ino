/*Serial Connection - Updated Values
Output Format: PACE=<value>,OUTPUT=<value>,SENSE=<value> */

void sendUpdatedValues(){

  if(power_pressed){

    bool senseChanged;
    if (isnan(sense) && isnan(lastSense)){
      senseChanged = false;
    }
    else{
      senseChanged = sense != lastSense;
    }

    if(pace != lastPace || output != lastOutput || senseChanged){

      Serial.print("PACE=");
      Serial.print(pace);
      Serial.print(",OUTPUT=");
      Serial.print(output);
      Serial.print(",SENSE=");
      Serial.println(sense);

      lastPace = pace;
      lastOutput = output;
      lastSense = sense;
    }
    else{
      return;
    }
  }
}
