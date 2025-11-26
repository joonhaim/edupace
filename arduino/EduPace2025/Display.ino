/*DISPLAY + UI*/

/*Key Button*/
lv_obj_t * key_btn;

/*Leds*/
lv_obj_t * left_circle;
lv_obj_t * right_circle;

/*Numbers*/
lv_obj_t * top_number;
lv_obj_t * middle_number;
lv_obj_t * bottom_number;

/*Labels*/
lv_obj_t * first_label;
lv_obj_t * second_label;
lv_obj_t * third_label;

/*Units*/
lv_obj_t * first_unit;
lv_obj_t * second_unit;
lv_obj_t * third_unit;

/*Create UI*/
void setupDisplay(){
  /*Background*/
  lv_obj_t * scr = lv_scr_act();                // get the active screen
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x03989e), LV_PART_MAIN); // dark blue

  /*Main container*/
  cont = lv_obj_create(scr);
  lv_obj_set_size(cont, 450, 770);             // slightly smaller than screen
  lv_obj_set_style_bg_color(cont, lv_color_hex(0xFFFFFF), LV_PART_MAIN); // white
  lv_obj_center(cont);                         // center in the screen
  lv_obj_set_style_radius(cont, 20, LV_PART_MAIN); // round the corners for nicer look
  lv_obj_set_style_pad_all(cont, 0, LV_PART_MAIN);

  /*LED (circle size)*/
  lv_coord_t circ_size = 30;

  //Left green circle 
  left_circle = lv_obj_create(cont);
  lv_obj_set_size(left_circle, circ_size, circ_size);
  lv_obj_set_style_radius(left_circle, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_bg_color(left_circle, lv_color_hex(0x00FF00), LV_PART_MAIN); // green
  lv_obj_set_style_border_color(left_circle, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_border_width(left_circle, 3, LV_PART_MAIN);
  lv_obj_align(left_circle, LV_ALIGN_TOP_LEFT, 2, 2); // top-left inside container

  //Right blue circle
  right_circle = lv_obj_create(cont);
  lv_obj_set_size(right_circle, circ_size, circ_size);
  lv_obj_set_style_radius(right_circle, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_bg_color(right_circle, lv_color_hex(0x0000FF), LV_PART_MAIN); // blue
  lv_obj_set_style_border_color(right_circle, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_border_width(right_circle, 3, LV_PART_MAIN);
  lv_obj_align(right_circle, LV_ALIGN_TOP_RIGHT, -2, 2); // top-right inside container
  

  /*Lock button*/
  key_btn = lv_btn_create(cont);
  lv_obj_set_size(key_btn, 110, 80); // small rectangle
  lv_obj_align(key_btn, LV_ALIGN_BOTTOM_RIGHT, -10, -10); // bottom-right corner with margin

  // Style button: black, yellow border
  lv_obj_set_style_bg_color(key_btn, lv_color_hex(0x000000), LV_PART_MAIN); 
  lv_obj_set_style_border_color(key_btn, lv_color_white(), LV_PART_MAIN);
  lv_obj_set_style_radius(key_btn, 5, LV_PART_MAIN); // rounded corners
  lv_obj_set_style_border_width(key_btn, 6, LV_PART_MAIN); // 6 px thick
  lv_obj_set_style_radius(key_btn, 20, LV_PART_MAIN); // round the corners for nicer look

  // Create an image inside the button
  lv_obj_t * key_img = lv_img_create(key_btn);
  lv_img_set_src(key_img, &key); // path to your uploaded image
  lv_obj_center(key_img);

  // Add click event
  lv_obj_add_event_cb(key_btn, key_button_event_cb, LV_EVENT_CLICKED, NULL);

  /* Battery icon */
  lv_obj_t * battery = lv_label_create(cont);
  lv_label_set_text(battery, LV_SYMBOL_BATTERY_FULL);   // or any battery symbol
  lv_obj_set_style_text_color(battery, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(battery, &lv_font_montserrat_40, LV_PART_MAIN);
  lv_obj_align(battery, LV_ALIGN_BOTTOM_LEFT, 10, -10); // bottom-left corner

  /*Number 1*/
  top_number = lv_label_create(cont);         // create label inside container
  lv_label_set_text(top_number, "80");                    // set number text
  lv_obj_set_style_text_color(top_number, lv_color_black(), LV_PART_MAIN); // black color
  lv_obj_set_style_text_font(top_number, &digital, LV_PART_MAIN); // big font (60px)
  lv_obj_align(top_number, LV_ALIGN_TOP_RIGHT, -15, 90);      //

  /*Number 2*/
  middle_number = lv_label_create(cont);         // create label inside container
  lv_label_set_text(middle_number, "10");                    // set number text
  lv_obj_set_style_text_color(middle_number, lv_color_black(), LV_PART_MAIN); // black color
  lv_obj_set_style_text_font(middle_number, &digital, LV_PART_MAIN); // big font (60px)
  lv_obj_align(middle_number, LV_ALIGN_TOP_RIGHT, -15, 305);      // 

  /*Number 3*/
  bottom_number = lv_label_create(cont);          // create label inside container
  lv_label_set_text(bottom_number, "2.0");                    // set number text
  lv_obj_set_style_text_color(bottom_number, lv_color_black(), LV_PART_MAIN); // black color
  lv_obj_set_style_text_font(bottom_number, &digital, LV_PART_MAIN); // big font (60px)
  lv_obj_align(bottom_number, LV_ALIGN_TOP_RIGHT, -15, 520);      // 

  /*Label 1: Pace*/
  first_label = lv_label_create(cont);
  lv_label_set_text(first_label, "Rate"); // unicode key symbol
  lv_obj_set_style_text_color(first_label, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(first_label, &lv_font_montserrat_36, LV_PART_MAIN);
  lv_obj_align(first_label, LV_ALIGN_TOP_RIGHT, -15, 40);

  /*Label 2: Output*/
  second_label = lv_label_create(cont);
  lv_label_set_text(second_label, "Output"); // unicode key symbol
  lv_obj_set_style_text_color(second_label, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(second_label, &lv_font_montserrat_36, LV_PART_MAIN);
  lv_obj_align(second_label, LV_ALIGN_TOP_RIGHT, -15, 255);

  /*Label 3: Sense*/
  third_label = lv_label_create(cont);
  lv_label_set_text(third_label, "Sense"); // unicode key symbol
  lv_obj_set_style_text_color(third_label, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(third_label, &lv_font_montserrat_36, LV_PART_MAIN);
  lv_obj_align(third_label, LV_ALIGN_TOP_RIGHT, -15, 470);

  /*Unit 1: ppm*/
  first_unit = lv_label_create(cont);
  lv_label_set_text(first_unit, "ppm"); // unicode key symbol
  lv_obj_set_style_text_color(first_unit, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(first_unit, &lv_font_montserrat_24, LV_PART_MAIN);
  lv_obj_align(first_unit, LV_ALIGN_TOP_RIGHT, -15, 210);

  /*Unit 2: mA*/
  second_unit = lv_label_create(cont);
  lv_label_set_text(second_unit, "mA"); // unicode key symbol
  lv_obj_set_style_text_color(second_unit, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(second_unit, &lv_font_montserrat_24, LV_PART_MAIN);
  lv_obj_align(second_unit, LV_ALIGN_TOP_RIGHT, -15, 425);

  /*Unit 3: mV*/
  third_unit = lv_label_create(cont);
  lv_label_set_text(third_unit, "mV"); // unicode key symbol
  lv_obj_set_style_text_color(third_unit, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(third_unit, &lv_font_montserrat_24, LV_PART_MAIN);
  lv_obj_align(third_unit, LV_ALIGN_TOP_RIGHT, -15, 640);

  /*EduPace 2.0*/
  lv_obj_t * edu_text = lv_label_create(cont);
  lv_label_set_text(edu_text, "EduPace 2.0"); // unicode key symbol
  lv_obj_set_style_text_color(edu_text, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(edu_text, &lv_font_montserrat_24, LV_PART_MAIN);
  lv_obj_align(edu_text, LV_ALIGN_TOP_MID, 0, 10);
  
}

/*Update Labels*/
void updateDisplayLabels() {
  /*static -> value stays in memory between function calls
  We store the previously displayed values so we can compare 
  and only update the label if the value changed
  NAN ensures that the first update always happens*/

  static float lastPace   = NAN;
  static float lastOutput = NAN;
  static float lastSense  = NAN;

  // --- PACE ---
  if (pace != lastPace) {
    String s = String((int)pace);   //integer
    lv_label_set_text(top_number, s.c_str()); // string -> c-string 
    lastPace = pace;
  }

  // --- OUTPUT ---
  if (output != lastOutput) {
    String s = String(output, 1);  //one decimal float
    lv_label_set_text(middle_number, s.c_str());
    lastOutput = output;
  }

  // --- SENSE ---
  if (senseIndex == senseSteps -1 ){
    lv_label_set_text(bottom_number, "--");
    lv_label_set_text(third_label, "async");
    lv_label_set_text(third_unit, " ");
    lastSense = NAN;   // force screen update next time sense returns to numeric
  }
  
  else if (sense != lastSense) {
    String s = String(sense, 1);  //one decimal float
    lv_label_set_text(bottom_number, s.c_str());
    lv_label_set_text(third_label, "Sense");
    lv_label_set_text(third_unit, "mV");
    lastSense = sense;
  }
}


