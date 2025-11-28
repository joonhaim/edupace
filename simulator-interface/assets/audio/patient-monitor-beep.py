import os
import numpy as np
from scipy.io.wavfile import write

# Parameters
sample_rate = 44100
frequency = 380
duration = 0.15
silence = 0.1

t_beep = np.linspace(0, duration, int(sample_rate * duration), False)
beep = 0.5 * np.sin(2 * np.pi * frequency * t_beep)
t_silence = np.zeros(int(sample_rate * silence))

audio = np.concatenate([beep, t_silence])

current_dir = os.path.dirname(__file__)
out_path = os.path.join(current_dir, "patient-monitor-beep.wav")

write(out_path, sample_rate, audio.astype(np.float32))

print("Saved to:", out_path)
