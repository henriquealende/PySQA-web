import numpy as np
from scipy.signal import resample, lfilter, filtfilt
from scipy.special import comb
from numpy.fft import fft, ifft
try:
    from sottek_hearing_model import shm_tonality_ecma
except ImportError:
    shm_tonality_ecma = None

class TonalityECMA:
    """
    Implementação da métrica de Tonalidade Psicoacústica baseada na norma
    ECMA-418-2, 2ª edição, 2022.

    Esta classe converte a lógica originalmente implementada em MATLAB para Python.
    """
    def _frame_signal(self, sig, frame_len, hop_len):
        """
        Segmenta um sinal em frames (janelas).
        Equivalente à função 'buffer' do MATLAB com a opção 'nodelay'.
        """
        num_frames = 1 + int(np.floor((len(sig) - frame_len) / hop_len))
        shape = (frame_len, num_frames)
        strides = (sig.strides[0], hop_len * sig.strides[0])
        return np.lib.stride_tricks.as_strided(sig, shape=shape, strides=strides)

    def _auditory_filtering(self, p0):
        """
        Realiza a filtragem auditiva conforme a seção 5.1 da ECMA 418-2.
        Equivalente ao AuditoryFiltering.m
        """
        # 5.1.2 Pré-processamento dos dados de entrada
        n = np.arange(240)
        w = 0.5 - 0.5 * np.cos(np.pi * n / 240)  # Eq. 1
        p0[:240] = w * p0[:240]

        # Parâmetros para Tonalidade (Tabela 4)
        sb = np.array([8192, 4096, 2048, 1024])
        sh = np.array([2048, 1024, 512, 256])

        sbm = np.max(sb)
        shm = np.max(sh)

        ns = len(p0)
        nn = shm * (np.ceil((ns + shm + sbm) / shm) - 1)  # Eq. 3
        nzend = int(nn - ns)  # Eq. 2
        p = np.pad(p0, (sbm, nzend), 'constant')

        # 5.1.3 Filtragem do ouvido externo e médio/interno
        b = np.array([
            [1.015896, -1.925299, 0.922118], [0.958943, -1.806088, 0.876439],
            [0.961372, -1.763632, 0.821788], [2.225804, -1.434650, -0.498204],
            [0.471735, -0.366092, 0.244145], [0.115267, 0.000000, -0.115267],
            [0.988029, -1.912434, 0.926132], [1.952238, 0.162320, -0.667994]
        ])
        a = np.array([
            [1, -1.925299, 0.938014], [1, -1.806088, 0.835382],
            [1, -1.763632, 0.783160], [1, -1.434650, 0.727599],
            [1, -0.366092, -0.284120], [1, -1.796003, 0.805838],
            [1, -1.912434, 0.914161], [1, 0.162320, 0.284244]
        ])

        for k in range(8):
            p = lfilter(b[k, :], a[k, :], p) # Eq. 5

        # 5.1.4 Banco de Filtros Auditivos
        z = np.arange(0.5, 27.0, 0.5)  # Taxa de Banda Crítica
        k_const, c_const, df0, rs = 5, 0.1618, 81.9289, 48000
        
        F = (df0 / c_const) * np.sinh(c_const * z) # Eq. 9
        df = np.sqrt(df0**2 + (c_const * F)**2) # Eq. 10
        tal = comb(2 * k_const - 2, k_const - 1) / (2**(2 * k_const - 1) * df) # Eq. 8
        d = np.exp(-1 / (rs * tal))
        e = np.array([0, 1, 11, 11, 1])
        
        aml = np.zeros((53, 5), dtype=np.complex128)
        for m in range(1, k_const + 1):
            aml[:, m - 1] = ((-d)**m) * comb(k_const, m) * np.exp(2j * np.pi * F * m / rs)

        bml = np.zeros((53, 5), dtype=np.complex128)
        bd = np.sum(e[1:k_const] * d[:, np.newaxis]**np.arange(1, k_const), axis=1)

        for m in range(k_const):
            bml[:, m] = (((1 - d)**k_const * (d**m) * e[m]) / bd) * np.exp(2j * np.pi * F * m / rs)

        pomz = np.zeros((53, len(p)), dtype=np.float64)
        for i in range(53):
            B = bml[i, :]
            A = np.concatenate(([1], aml[i, :]))
            y = lfilter(B, A, p) # Eq. 13
            pomz[i, :] = 2 * np.real(y)

        return sb, sh, int(nn), F, df, pomz

    def _basis_loud_ton(self, nn, pomz, k, bnd):
        """
        Calcula a Loudness específica para a Tonalidade.
        Equivalente ao BasisLoudTon.m
        """
        sb = np.array([8192, 4096, 2048, 1024])
        sh = np.array([2048, 1024, 512, 256])

        is_val = 8192 - sb[k-1] # Eq. 19
        lend = int(np.ceil((nn + sh[k-1]) / sh[k-1]) - 1)
        
        prect = np.zeros((sb[k-1], lend + 1, len(bnd)))
        pt = np.zeros((len(bnd), lend + 1))
        
        for n, i in enumerate(bnd):
            pomz_i = pomz[i-1, :]
            pl = self._frame_signal(pomz_i[is_val:], sb[k-1], sh[k-1])
            pl = np.copy(pl) 
            pl[pl <= 0] = 0 # Retificação (Eq. 21)
            pt[n, :] = np.sqrt(2 * np.sum(pl**2, axis=0) / sb[k-1]) # Eq. 22
            prect[:, :, n] = pl

        p0_ref, cn, alpha, M = 20e-6, 0.0211668, 1.5, 8
        db = np.array([15, 25, 35, 45, 55, 65, 75, 85])
        vi = np.array([1, 0.6602, 0.0864, 0.6384, 0.0328, 0.4068, 0.2082, 0.3994, 0.6434])
        pti = p0_ref * 10**(db / 20)
        
        prod = np.ones_like(pt)
        for i in range(M):
            prod *= (1 + (pt / pti[i])**alpha)**((vi[i + 1] - vi[i]) / alpha)
        
        a_linha = cn * (pt / p0_ref) * prod # Eq. 23

        ltq = np.array([
            0.3310, 0.1625, 0.1051, 0.0757, 0.0576, 0.0453, 0.0365, 0.0298, 0.0247, 0.0207, 0.0176,
            0.0151, 0.0131, 0.0115, 0.0103, 0.0093, 0.0086, 0.0081, 0.0077, 0.0074, 0.0073, 0.0072,
            0.0071, 0.0072, 0.0073, 0.0074, 0.0076, 0.0079, 0.0082, 0.0086, 0.0092, 0.0100, 0.0109,
            0.0122, 0.0138, 0.0157, 0.0172, 0.0180, 0.0180, 0.0177, 0.0176, 0.0177, 0.0182, 0.0190,
            0.0202, 0.0217, 0.0237, 0.0263, 0.0296, 0.0339, 0.0398, 0.0485, 0.0622
        ])
        
        nb = a_linha - ltq[np.array(bnd) - 1, np.newaxis] # Eq. 25
        nb[nb < 0] = 0 # Eq. 25
        return prect, nb

    def calculate_tonality(self, P0, fs=48000):
        """
        Calcula a Tonalidade de um sinal de áudio.
        Equivalente ao TonalityECMA22.m
        """
        if fs != 48000:
            print(f"Taxa de amostragem original: {fs} Hz. Realizando resample para 48000 Hz...")
            num_samples = int(len(P0) * 48000 / fs)
            P0 = resample(P0, num_samples)
        
        if np.max(np.abs(P0)) > 0:
            p0_norm = P0 / np.max(np.abs(P0))
        else:
            p0_norm = P0
        
        sb, sh, nn, F, df, pomz = self._auditory_filtering(p0_norm)

        ts = np.maximum(0.5 / df, 2e-3)
        tend = np.maximum(4. / df, ts + 1e-3)
        
        rs = 48000
        ms = np.ceil(ts * rs).astype(int)
        me = np.floor(tend * rs).astype(int)

        lend = int(np.ceil((nn + sh[3]) / sh[3]) - 1)
        Fi = np.array([8, 4, 2, 1])
        Nti = np.zeros((53, lend + 1))
        Nsig = np.zeros((53, lend + 1))
        fton = np.zeros((53, lend + 1))

        CB = {1: range(1, 6), 2: range(2, 19), 3: range(16, 27), 4: range(26, 54)}
        BC = {1: range(1, 4), 2: range(4, 17), 3: range(17, 26), 4: range(26, 54)}
        N_movmean = [5, 5, 3, 1]

        for k in range(1, 5):
            bnd = list(CB[k])
            prect, Nb = self._basis_loud_ton(nn, pomz, k, bnd)
            m1 = np.arange(int(0.75 * sb[k-1]))
            
            # --- MODIFICAÇÃO PARA OTIMIZAR MEMÓRIA ---
            # Pré-aloca a matriz de saída para phiu
            phiu_shape = (2 * sb[k-1], prect.shape[1], prect.shape[2])
            phiu = np.zeros(phiu_shape, dtype=np.float64)

            # Processa a FFT e IFFT banda por banda para evitar estouro de memória
            for band_idx in range(prect.shape[2]):
                temp_fft = fft(prect[:, :, band_idx], 2 * sb[k-1], axis=0)
                temp_phiu = np.abs(temp_fft)**2
                phiu[:, :, band_idx] = np.real(ifft(temp_phiu, axis=0))
            # --- FIM DA MODIFICAÇÃO ---
            
            A1 = np.cumsum(prect**2, axis=0)
            A1 = A1[sb[k-1] - m1 - 1, :, :]
            A1 = np.flip(A1, axis=0)
            
            A2 = np.cumsum(np.flip(prect**2, axis=0), axis=0)
            A2 = np.flip(A2, axis=0)
            A2 = A2[m1, :, :]

            phi = phiu[m1, :, :] / (np.sqrt(A1 * A2) + 1e-12)
            phil = np.zeros_like(phiu)
            phil[:phi.shape[0], :, :] = phi
            
            Nb_permuted = np.transpose(Nb, (1, 0))
            phil = Nb_permuted[np.newaxis, :, :] * phil

            if k == 1:
                phio = np.copy(phil)
                phil[:,:,0] = np.mean(phio[:,:,0:2], axis=2)
                phil[:,:,1] = np.mean(phio[:,:,0:3], axis=2)
                phil[:,:,2] = np.mean(phio[:,:,0:5], axis=2)
                phil = phil[:,:,0:3]
            
            if k == 2 or k == 3:
                kernel = np.ones(N_movmean[k-1]) / N_movmean[k-1]
                phil = np.apply_along_axis(lambda x: np.convolve(x, kernel, mode='valid'), axis=2, arr=phil)

            if k < 3:
                L_phil = phil.shape[1]
                kernel = np.ones(3) / 3
                Mb = np.apply_along_axis(lambda x: np.convolve(x, kernel, mode='valid'), axis=1, arr=phil)
                if Mb.shape[1] == L_phil - 2:
                    phil[:, 1:L_phil-1, :] = Mb

            phim0 = phil[0, :, :].T
            
            for n_idx, i in enumerate(BC[k]):
                if n_idx < phil.shape[2]:
                    M = me[i-1] - ms[i-1] + 1
                    wind = phil[ms[i-1]:me[i-1]+1, :, n_idx] - np.sum(phil[ms[i-1]:me[i-1]+1, :, n_idx], axis=0) / M
                    X = fft(wind, 16384, axis=0)
                    
                    Nton = 2 * np.max(np.abs(X), axis=0) / (M / 2)
                    ind = Nton > phim0[n_idx, :]
                    Nton[ind] = phim0[n_idx, ind]
                    
                    kmax = np.argmax(np.abs(X), axis=0)
                    ft = kmax * (rs / 16384)
                    
                    L_interp = phil.shape[1]
                    x_interp = np.arange(1, L_interp + 1)
                    x_new = np.arange(1, L_interp + (1/Fi[k-1]), 1/Fi[k-1])
                    
                    target_len = min(len(x_new), Nti.shape[1] -1)
                    Nti[i-1, :target_len] = np.interp(x_new[:target_len], x_interp, Nton)
                    Nsig[i-1, :target_len] = np.interp(x_new[:target_len], x_interp, phim0[n_idx, :])
                    fton[i-1, :target_len] = np.interp(x_new[:target_len], x_interp, ft)

        ns = len(p0_norm)
        lendn = int(np.ceil(ns * 187.5 / rs))
        Nti = Nti[:, :lendn+1]
        fton = fton[:, :lendn+1]
        Nsig = Nsig[:, :lendn+1]

        k_filt, tal = 3, 0.0268
        d_filt = np.exp(-1 / (187.5 * tal))
        e_filt = np.array([0, 1, 1])
        
        am = np.zeros(k_filt)
        for m in range(1, k_filt + 1):
            am[m-1] = ((-d_filt)**m) * comb(k_filt, m)
        
        bm_den = np.sum(e_filt[1:k_filt] * d_filt**np.arange(1, k_filt))
        bm = np.zeros(k_filt)
        for m in range(k_filt):
             bm[m] = (((1 - d_filt)**k_filt) * (d_filt**m) * e_filt[m]) / bm_den

        SNR = Nti / (Nsig - Nti + 1e-12)
        SNR[np.isinf(SNR) | np.isnan(SNR)] = 0
        
        Ntif = filtfilt(bm, np.concatenate(([1], am)), Nti, axis=1)
        SNRf = filtfilt(bm, np.concatenate(([1], am)), SNR, axis=1)
        Nsigf = filtfilt(bm, np.concatenate(([1], am)), Nsig, axis=1)

        z = np.arange(0.5, 27, 0.5)
        sb_vals = ( (0.5 <= z) & (z <= 1.5) ) * sb[0] + \
                  ( (2 <= z) & (z <= 8) ) * sb[1] + \
                  ( (8.5 <= z) & (z <= 12.5) ) * sb[2] + \
                  ( z >= 13 ) * sb[3]

        c_vals = (sb_vals == 8192) * 18.21 + (sb_vals == 4096) * 12.14 + \
                 (sb_vals == 2048) * 417.54 + (sb_vals == 1024) * 962.68
        d_vals = (sb_vals == 8192) * 0.36 + (sb_vals == 4096) * 0.36 + \
                 (sb_vals == 2048) * 0.71 + (sb_vals == 1024) * 0.69

        g = c_vals / (F**d_vals)
        nr = 1 - np.exp(-20 * (SNRf / g[:, np.newaxis] - 0.07))
        nr[nr <= 0] = 0
        Ntonalf = nr * Ntif

        Nnoise = Nsigf - Ntonalf
        SNR2 = np.max(Ntonalf, axis=0) / (1e-12 + np.sum(Nnoise, axis=0))
        q = 1 - np.exp(-35 * (SNR2 - 0.003))
        q[q <= 0] = 0
        
        ct = 2.8785151 * 1.00055 
        T = ct * q * Ntonalf
        
        t = np.arange(T.shape[1]) / 187.5
        
        T1 = T[:, 57:]
        f1 = fton[:, 57:]
        Ts = np.zeros(53)
        fts = np.zeros(53)
        for i in range(53):
            T2_indices = T1[i, :] > 0.02
            T2 = T1[i, T2_indices]
            Ts[i] = np.sum(T2) / (len(T2) + 1e-12)
            
            f2 = f1[i, T2_indices]
            fts[i] = np.sum(f2) / (len(f2) + 1e-12) if len(f2) > 0 else 0
            
        Ttd = np.max(T, axis=0)
        zmax = np.argmax(T, axis=0)
        ftd = fton[zmax, np.arange(T.shape[1])]
        
        Tsv_vals = Ttd[57:]
        Tsv_vals = Tsv_vals[Tsv_vals > 0.02]
        Tsv = np.sum(Tsv_vals) / (len(Tsv_vals) + 1e-12) if len(Tsv_vals) > 0 else 0

        return T, Ts, Ttd, Tsv, fts, ftd, F, t, z
    
    def tonalityECMA_Shm(self, timeData, samplingRate, field_type="free"):
        shape = len(np.shape(timeData))
        if shape >= 2:
            timeData = timeData[:,0]
        Bark = np.array([0.0])
        globalTonality = 0.0
        specificTonality = np.zeros(1)
        time_data = None
        if len(timeData) > 0:
            soundfield = 'free_frontal' if field_type == 'free' else 'diffuse'
            tonality_ecma = shm_tonality_ecma(timeData, samplingRate, soundfield=soundfield)
            freq = tonality_ecma['band_centre_freqs']
            Bark = self._freq_to_bark_hms(freq)
            # spec_tonality_avg  → time-averaged specific tonality per band [0..1] tu_HMS
            # spec_tonality_avg_freqs → dominant tonal FREQUENCIES in Hz (not tonality!)
            specificTonality = np.array(tonality_ecma['spec_tonality_avg']).ravel()
            # tonality_avg is the time-aggregated overall tonality scalar (ECMA-418-2)
            globalTonality = float(np.ravel(tonality_ecma['tonality_avg'])[0])
            time_data = {
                't':      np.asarray(tonality_ecma['time_out']).ravel(),
                'values': np.asarray(tonality_ecma['tonality_t']).ravel(),
            }
        return (Bark, globalTonality, specificTonality, time_data)
    

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