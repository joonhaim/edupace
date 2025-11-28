import numpy as np
from scipy.io.wavfile import write

# Parameters for lower-pitched beep
sample_rate = 44100
frequency = 550  # Lower pitch (~550 Hz)
duration = 0.12
silence = 0.1

t_beep = np.linspace(0, duration, int(sample_rate * duration), False)
beep = 0.5 * np.sin(2 * np.pi * frequency * t_beep)

t_silence = np.zeros(int(sample_rate * silence))

audio = np.concatenate([beep, t_silence])

path = "/edupace/simulator-interface/assets"
write(path, sample_rate, audio.astype(np.float32))

path
