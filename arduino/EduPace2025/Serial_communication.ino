/*Serial Connection - Updated Values
Output Format: PACE=80.00,OUTPUT=10.00,SENSE=2.00 */

void sendUpdatedValues(){

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
}
