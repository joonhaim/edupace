import os
import numpy as np
from scipy.io.wavfile import write

# Parameters
sample_rate = 44100          # CD-quality audio
duration_beep = 0.18         # seconds for the audible "pip"
silence = 0.12               # silence after the beep (for looping)
freq_main = 450.0            # main tone (Hz)
freq_harm = 1800.0           # harmonic

# Time axis for the beep
t = np.linspace(0, duration_beep, int(sample_rate * duration_beep), endpoint=False)

# Base signal:
signal = (
    0.7 * np.sin(2 * np.pi * freq_main * t) +
    0.3 * np.sin(2 * np.pi * freq_harm * t)
)

# Envelope: quick attack + smooth exponential decay
attack_time = 0.015  # 15 ms attack
attack_samples = int(sample_rate * attack_time)
decay_samples = len(t) - attack_samples

attack_env = np.linspace(0.0, 1.0, attack_samples, endpoint=False)
# Exponential decay from 1.0 downwards
decay_env = np.exp(-np.linspace(0.0, 3.0, decay_samples))
decay_env /= decay_env.max()  # normalize so it starts at 1

envelope = np.concatenate([attack_env, decay_env])

beep = signal * envelope

# Normalize
beep /= np.max(np.abs(beep))
beep *= 0.4  # overall volume – lower = softer

# Silence segment
silence_segment = np.zeros(int(sample_rate * silence), dtype=np.float32)

# Final audio: one beep followed by silence
audio = np.concatenate([beep.astype(np.float32), silence_segment])

# Output path
current_dir = os.path.dirname(__file__)
out_path = os.path.join(current_dir, "patient-monitor-beep-soft.wav")

write(out_path, sample_rate, audio)

print("Saved to:", out_path)
