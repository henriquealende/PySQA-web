import numpy as np


from mosqito.sq_metrics import loudness_zwst, loudness_zwtv
from mosqito.sq_metrics import loudness_ecma
try:
    from sottek_hearing_model import shm_loudness_ecma
except ImportError:
    shm_loudness_ecma = None
class Loudness():
    def __init__(self):
        super(Loudness, self).__init__()         

        
        
    def loudnessZWK(self, timeData, samplingRate, field_type="diffuse", compute_time_varying=True):
        shape = len(np.shape(timeData))
        if shape >= 2:
            timeData = timeData[:,0]
        Bark = np.arange(0.1, 24.1, 0.1)
        globalLoudness = 0
        specificLoudness = np.zeros_like(Bark)
        time_data = None
        if len(timeData) > 0:
            globalLoudness, specificLoudness, Bark = loudness_zwst(timeData, samplingRate, field_type=field_type)
            if compute_time_varying:
                # Time-varying loudness (ISO 532-1) — requires 48 kHz; resample if needed
                _FS_TV = 48000
                if samplingRate != _FS_TV:
                    from scipy.signal import resample_poly
                    from math import gcd
                    _g = gcd(int(samplingRate), _FS_TV)
                    tv_signal = resample_poly(timeData, _FS_TV // _g, int(samplingRate) // _g)
                else:
                    tv_signal = timeData
                N_t, _, _, t_arr = loudness_zwtv(tv_signal, _FS_TV, field_type=field_type)
                time_data = {
                    't':      np.asarray(t_arr).ravel(),
                    'values': np.asarray(N_t).ravel(),
                }
        return (Bark, globalLoudness, specificLoudness, time_data)
            
    def loudnessECMA_Mqt(self, timeData, samplingRate):
        # Development/benchmark implementation via MoSQITo.
        # Production path should use loudnessECMA(), which maps to Sottek HM.
        shape = len(np.shape(timeData))
        if shape >= 2:
            timeData = timeData[:,0]
        Bark = np.arange(0.1, 24.1, 0.1)
        globalLoudness = 0
        specificLoudness = np.zeros_like(Bark)
        if len(timeData) > 0:
            globalLoudness, _, specificLoudness, Bark, _ = loudness_ecma(timeData, samplingRate)
            specificLoudness = np.asarray(specificLoudness)
        return (Bark, globalLoudness, specificLoudness)
    
    def loudnessECMA_Shm(self, timeData, samplingRate, field_type="free"):
        shape = len(np.shape(timeData))
        if shape >= 2:
            timeData = timeData[:,0]
        Bark = np.array([0.0])
        globalLoudness = 0
        specificLoudness = 0
        time_data = None
        if len(timeData) > 0:
            soundfield = 'free_frontal' if field_type == 'free' else 'diffuse'
            loudness_ecma = shm_loudness_ecma(timeData, samplingRate, soundfield=soundfield, binaural=False)
            freq = loudness_ecma['band_centre_freqs']
            Bark = self._freq_to_bark_hms(freq)
            specificLoudness = loudness_ecma['spec_loudness_powavg']
            globalLoudness = float(loudness_ecma['loudness_powavg'][0])
            time_data = {
                't':      np.asarray(loudness_ecma['time_out']).ravel(),
                'values': np.asarray(loudness_ecma['loudness_t']).ravel(),
            }
        return (Bark, globalLoudness, specificLoudness, time_data)

    def loudnessECMA(self, timeData, samplingRate, field_type="free"):
        """ECMA-418-2 loudness used in production (Sottek Hearing Model)."""
        return self.loudnessECMA_Shm(timeData, samplingRate, field_type=field_type)
    

    def _freq_to_bark_hms(self, f_hz):
        
        DELTA_F0 = 81.9289
        C = 0.1618
        f_hz_array = np.asarray(f_hz)
        
        if np.any(f_hz_array < 0):
            raise ValueError("As frequências devem ser não-negativas.")

        argumento = (f_hz_array * C) / DELTA_F0
        z_bark = (1.0 / C) * np.arcsinh(argumento)
        
        if np.ndim(f_hz) == 0:
            return float(z_bark)
            
        return z_bark