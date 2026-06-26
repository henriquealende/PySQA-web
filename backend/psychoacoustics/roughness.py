import numpy as np

from mosqito.sq_metrics import roughness_dw
from mosqito.sq_metrics import roughness_ecma
try:
    from sottek_hearing_model import shm_roughness_ecma
except ImportError:
    shm_roughness_ecma = None
class Roughness():
    def __init__(self):
        super(Roughness, self).__init__()         

        
        
    def roughnessDW(self, timeData, samplingRate):
        shape = len(np.shape(timeData))
        if shape >= 2:
            timeData = timeData[:,0]
        Bark = np.arange(0.5, 24.5, 0.5)
        globalRoughness = 0
        specificRoughness = 0
        time_data = None
        if len(timeData) > 0:
            R_time, specificRoughness, Bark, t_arr = roughness_dw(timeData, samplingRate, overlap = 0)
            R_time = np.asarray(R_time).ravel()
            t_arr  = np.asarray(t_arr).ravel()
            time_data = {'t': t_arr, 'values': R_time}
            # Use the N10 statistic (90th percentile) as global roughness.
            # This matches commercial SQA software behaviour: silent / near-silent
            # frames (e.g. pauses in speech) would wrongly drag the simple mean down
            # to about half the voiced-only value, while N10 is insensitive to them.
            globalRoughness = float(np.percentile(R_time, 90))
            # For specific roughness, average only over the frames above the median
            # roughness level so that silent frames do not dilute the curve shape.
            R_per_frame = np.array([0.25 * np.sum(specificRoughness[:, i])
                                    for i in range(specificRoughness.shape[1])])
            threshold = np.median(R_per_frame)
            active = R_per_frame >= threshold
            if np.any(active):
                specificRoughness = np.mean(specificRoughness[:, active], axis=1)
            else:
                specificRoughness = np.mean(specificRoughness, axis=1)
        return (Bark, globalRoughness, specificRoughness, time_data)

    def roughnessECMA_Mqt(self, timeData, samplingRate):
        shape = len(np.shape(timeData))
        if shape >= 2:
            timeData = timeData[:,0]
        Bark = np.arange(0.5, 24.5, 0.5)
        globalRoughness = 0
        specificRoughness = 0
        if len(timeData) > 0:
            globalRoughness, _, specificRoughness, Bark, _ = roughness_ecma(timeData, samplingRate)
        return (Bark, globalRoughness, specificRoughness)
    
    def roughnessECMA_Shm(self, timeData, samplingRate, field_type="free"):
        shape = len(np.shape(timeData))
        if shape >= 2:
            timeData = timeData[:,0]
        Bark = np.array([0.0])
        globalRoughness = 0
        specificRoughness = 0
        time_data = None
        if len(timeData) > 0:
            soundfield = 'free_frontal' if field_type == 'free' else 'diffuse'
            roughness_ecma = shm_roughness_ecma(timeData, samplingRate, soundfield=soundfield, binaural=False)
            freq = roughness_ecma['band_centre_freqs']
            Bark = self._freq_to_bark_hms(freq)
            specificRoughness = roughness_ecma['spec_roughness_avg']
            globalRoughness = float(roughness_ecma['roughness90pc'][0])
            time_data = {
                't':      np.asarray(roughness_ecma['time_out']).ravel(),
                'values': np.asarray(roughness_ecma['roughness_t']).ravel(),
            }
        return (Bark, globalRoughness, specificRoughness, time_data)
    

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