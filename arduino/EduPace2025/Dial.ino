/*DIAL*/

lv_obj_t * create_meter(lv_obj_t * parent, int min, int max)
{
  /* Container holding scale + arc */
  lv_obj_t * cont = lv_obj_create(parent);
  lv_obj_set_size(cont, 200, 200);
  lv_obj_set_style_bg_opa(cont, LV_OPA_TRANSP, 0);
  lv_obj_set_style_pad_all(cont, 0, 0);
  lv_obj_set_style_border_width(cont, 0, 0);

  /* SCALE */
  lv_obj_t * scale = lv_scale_create(cont);
  lv_scale_set_mode(scale, LV_SCALE_MODE_ROUND_INNER);
  lv_scale_set_range(scale, min, max);
  lv_scale_set_total_tick_count(scale, 21);
  lv_scale_set_major_tick_every(scale, 5);

  lv_obj_set_size(scale, 180, 180);
  lv_obj_center(scale);

  lv_obj_set_style_line_width(scale, 2, LV_PART_ITEMS);
  lv_obj_set_style_line_color(scale, lv_color_hex(0x555555), LV_PART_ITEMS);

  /* Arc angles: 270° total sweep */
  int a_start = 135;
  int a_end   = 45;

  int total_span = (360 - a_start + a_end) % 360; // = 270
  int green_span = 120;                   
  int yellow_span = 95;
  int red_span = 55;

  /* Segment 1 – GREEN */
  lv_obj_t * arc_g = lv_arc_create(cont);
  lv_obj_set_size(arc_g, 200, 200);
  lv_arc_set_range(arc_g, 0, 100);  // fake range
  lv_arc_set_value(arc_g, 0);
  lv_arc_set_rotation(arc_g, a_start);
  lv_arc_set_bg_angles(arc_g, 0, green_span); 
  lv_obj_set_style_arc_color(arc_g, lv_color_hex(0x4CAF50), LV_PART_MAIN);
  lv_obj_set_style_arc_width(arc_g, 8, LV_PART_MAIN);
  lv_obj_set_style_arc_opa(arc_g, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_radius(arc_g, 0, LV_PART_KNOB);
  lv_obj_set_style_bg_opa(arc_g, LV_OPA_TRANSP, LV_PART_KNOB);
  lv_obj_clear_flag(arc_g, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_center(arc_g);

  /* Segment 2 – YELLOW */
  lv_obj_t * arc_y = lv_arc_create(cont);
  lv_obj_set_size(arc_y, 200, 200);
  lv_arc_set_range(arc_y, 0, 100);  // fake range
  lv_arc_set_value(arc_y, 0);
  lv_arc_set_rotation(arc_y, a_start + green_span);
  lv_arc_set_bg_angles(arc_y, 0, yellow_span); 
  lv_obj_set_style_arc_color(arc_y, lv_color_hex(0xFFEB3B), LV_PART_MAIN);
  lv_obj_set_style_arc_width(arc_y, 8, LV_PART_MAIN);
  lv_obj_set_style_arc_opa(arc_y, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_radius(arc_y, 0, LV_PART_KNOB);
  lv_obj_set_style_bg_opa(arc_y, LV_OPA_TRANSP, LV_PART_KNOB);
  lv_obj_clear_flag(arc_y, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_center(arc_y);

  /* Segment 3 – RED */
  lv_obj_t * arc_r = lv_arc_create(cont);
  lv_obj_set_size(arc_r, 200, 200);
  lv_arc_set_range(arc_r, 0, 100);  // fake range
  lv_arc_set_value(arc_r, 0);
  lv_arc_set_rotation(arc_r, a_start + green_span + yellow_span);
  lv_arc_set_bg_angles(arc_r, 0, red_span); // span = 1/3
  lv_obj_set_style_arc_color(arc_r, lv_color_hex(0xF44336), LV_PART_MAIN);
  lv_obj_set_style_arc_width(arc_r, 8, LV_PART_MAIN);
  lv_obj_set_style_arc_opa(arc_r, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_radius(arc_r, 0, LV_PART_KNOB);
  lv_obj_set_style_bg_opa(arc_r, LV_OPA_TRANSP, LV_PART_KNOB);
  lv_obj_clear_flag(arc_r, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_center(arc_r);

  /* FOREGROUND INDICATOR ARC (needle arc) */
  lv_obj_t * arc_fg = lv_arc_create(cont);
  lv_obj_set_size(arc_fg, 185, 185);

  lv_arc_set_range(arc_fg, min, max);
  lv_arc_set_bg_angles(arc_fg, a_start, a_end);
  lv_arc_set_rotation(arc_fg, 0);

  lv_obj_set_style_arc_color(arc_fg, lv_color_hex(0x000000), LV_PART_INDICATOR);
  lv_obj_set_style_arc_width(arc_fg, 4, LV_PART_INDICATOR);
  lv_obj_set_style_radius(arc_fg, 0, LV_PART_KNOB);
  lv_obj_set_style_bg_opa(arc_fg, LV_OPA_TRANSP, LV_PART_KNOB);
  lv_obj_set_style_arc_opa(arc_fg, LV_OPA_TRANSP, LV_PART_MAIN); // hide background arc

  lv_obj_center(arc_fg);

  return arc_fg;
}

void update_opacity_meter(lv_obj_t* fg_arc, int value, int min, int max)
{
  int angle_span = map(value, min, max, 0, 360); // value → angle
  lv_arc_set_bg_angles(fg_arc, 0, angle_span);   // set dark portion
}
lv_obj_t * meter1_fg, * meter2_fg, * meter3_fg;

void setupDial(){
  /* Vertical column for the 3 dials */
  lv_obj_t * meter_column = lv_obj_create(cont);
  lv_obj_set_style_bg_opa(meter_column, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(meter_column, 0, 0);
  lv_obj_set_size(meter_column, 250, 700);
  lv_obj_align(meter_column, LV_ALIGN_LEFT_MID, 20, 20);

  /* Flex layout (vertical) */
  lv_obj_set_flex_flow(meter_column, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(meter_column, 30, 0); //30px between dials
  lv_obj_set_style_pad_all(meter_column, 0, 0);

  /* Create and store the real FG arcs */
  meter1_fg = create_meter(meter_column, 30, 200);   // Pace
  meter2_fg = create_meter(meter_column, 0, 25);     // Output
  meter3_fg = create_meter(meter_column, 0, 20);     // Sense

  /* Make dials non-touchable */
  lv_obj_clear_flag(meter1_fg, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(meter2_fg, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(meter3_fg, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_clear_flag(meter_column, LV_OBJ_FLAG_CLICKABLE);  
}

void updateDial(){
  
  /* Pace dial: range 30–200 */
  lv_arc_set_value(meter1_fg, (int)pace);

  /* Output dial: range 0–25 */
  lv_arc_set_value(meter2_fg, (int)output);

  /* Sense dial: last index = ASYNC */
  if (senseIndex == senseSteps - 1) {
    lv_arc_set_value(meter3_fg, 0);   // or leave at last value
  }
  else {
    lv_arc_set_value(meter3_fg, (int)sense);
  }

}
