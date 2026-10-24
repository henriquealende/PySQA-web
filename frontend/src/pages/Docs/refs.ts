/**
 * Bibliographic references of the documentation, in the ABNT style (NBR 6023:2018 for the list, NBR 10520:2023
 * for the citations in the text, author-date system).
 *
 * `cite` is what appears in the text: "(FASTL; ZWICKER, 2007)".
 * `entry` is the full reference. Text between double asterisks is the highlighted (bold) title.
 * `sort` orders the list alphabetically, as the standard asks.
 * Online items carry the date they were checked ("Acesso em").
 */
export interface Ref {
  id: string
  cite: string
  sort: string
  entry: string
  url?: string
}

const ACCESS = 'Acesso em: 22 out. 2026.'

export const REFS: Record<string, Ref> = {
  allen1977: {
    id: 'allen1977', cite: 'ALLEN; RABINER, 1977', sort: 'ALLEN',
    entry: 'ALLEN, J. B.; RABINER, L. R. A unified approach to short-time Fourier analysis and synthesis. **Proceedings of the IEEE**, [s. l.], v. 65, n. 11, p. 1558-1564, nov. 1977.',
  },
  bismarck1974: {
    id: 'bismarck1974', cite: 'BISMARCK, 1974', sort: 'BISMARCK',
    entry: 'BISMARCK, G. von. Sharpness as an attribute of the timbre of steady sounds. **Acustica**, Stuttgart, v. 30, n. 3, p. 159-172, 1974.',
  },
  butterworth1930: {
    id: 'butterworth1930', cite: 'BUTTERWORTH, 1930', sort: 'BUTTERWORTH',
    entry: 'BUTTERWORTH, S. On the theory of filter amplifiers. **Experimental Wireless and the Wireless Engineer**, London, v. 7, p. 536-541, 1930.',
  },
  daniel1997: {
    id: 'daniel1997', cite: 'DANIEL; WEBER, 1997', sort: 'DANIEL',
    entry: 'DANIEL, P.; WEBER, R. Psychoacoustical roughness: implementation of an optimized model. **Acustica**, Stuttgart, v. 83, n. 1, p. 113-123, 1997.',
  },
  din45692: {
    id: 'din45692', cite: 'DIN, 2009', sort: 'DEUTSCHES',
    entry: 'DEUTSCHES INSTITUT FÜR NORMUNG. **DIN 45692:2009-08**: Messtechnische Simulation der Hörempfindung Schärfe (measurement technique for the simulation of the auditory sensation of sharpness). Berlin: DIN, 2009. DOI: 10.31030/1521326.',
  },
  ecma418: {
    id: 'ecma418', cite: 'ECMA INTERNATIONAL, 2025', sort: 'ECMA',
    entry: 'ECMA INTERNATIONAL. **ECMA-418-2**: psychoacoustic metrics for ITT equipment – Part 2: methods for describing human perception based on the Sottek Hearing Model. 4. ed. Geneva: Ecma International, 2025. Disponível em: https://ecma-international.org/wp-content/uploads/ECMA-418-2_4th_edition_june_2025.pdf. ' + ACCESS,
    url: 'https://ecma-international.org/wp-content/uploads/ECMA-418-2_4th_edition_june_2025.pdf',
  },
  eomys: {
    id: 'eomys', cite: 'EOMYS ENGINEERING, 2024', sort: 'EOMYS',
    entry: 'EOMYS ENGINEERING. **MoSQITo**: modular sound quality integrated toolbox. [S. l.]: GitHub, 2024. Disponível em: https://github.com/Eomys/MoSQITo. ' + ACCESS,
    url: 'https://github.com/Eomys/MoSQITo',
  },
  brandt2011: {
    id: 'brandt2011', cite: 'BRANDT, 2011', sort: 'BRANDT',
    entry: 'BRANDT, A. **Noise and vibration analysis**: signal analysis and experimental procedures. Chichester: Wiley, 2011.',
  },
  ewins2000: {
    id: 'ewins2000', cite: 'EWINS, 2000', sort: 'EWINS',
    entry: 'EWINS, D. J. **Modal testing**: theory, practice and application. 2. ed. Baldock: Research Studies Press, 2000.',
  },
  iso76265: {
    id: 'iso76265', cite: 'ISO, 2019', sort: 'INTERNATIONAL ORGANIZATION 2019',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 7626-5:2019**: vibration and shock – experimental determination of mechanical mobility – Part 5: measurements using impact excitation with an exciter which is not attached to the structure. 2. ed. Geneva: ISO, 2019.',
  },
  pyuff: {
    id: 'pyuff', cite: 'LADISK, [s. d.]', sort: 'LADISK',
    entry: 'LADISK. **pyuff**: read and write Universal File Format (UFF) files. [S. l.]: GitHub, [s. d.]. Disponível em: https://github.com/ladisk/pyuff. Acesso em: 22 out. 2026.',
    url: 'https://github.com/ladisk/pyuff',
  },
  welch1967: {
    id: 'welch1967', cite: 'WELCH, 1967', sort: 'WELCH',
    entry: 'WELCH, P. D. The use of fast Fourier transform for the estimation of power spectra: a method based on time averaging over short, modified periodograms. **IEEE Transactions on Audio and Electroacoustics**, [s. l.], v. 15, n. 2, p. 70-73, jun. 1967. DOI: 10.1109/TAU.1967.1161901.',
  },
  fastl2007: {
    id: 'fastl2007', cite: 'FASTL; ZWICKER, 2007', sort: 'FASTL',
    entry: 'FASTL, H.; ZWICKER, E. **Psychoacoustics**: facts and models. 3. ed. Berlin: Springer, 2007. (Springer Series in Information Sciences, v. 22). DOI: 10.1007/978-3-540-68888-4.',
  },
  gustafsson1996: {
    id: 'gustafsson1996', cite: 'GUSTAFSSON, 1996', sort: 'GUSTAFSSON',
    entry: 'GUSTAFSSON, F. Determining the initial states in forward-backward filtering. **IEEE Transactions on Signal Processing**, [s. l.], v. 44, n. 4, p. 988-992, abr. 1996.',
  },
  harris1978: {
    id: 'harris1978', cite: 'HARRIS, 1978', sort: 'HARRIS F',
    entry: 'HARRIS, F. J. On the use of windows for harmonic analysis with the discrete Fourier transform. **Proceedings of the IEEE**, [s. l.], v. 66, n. 1, p. 51-83, jan. 1978.',
  },
  harris2020: {
    id: 'harris2020', cite: 'HARRIS et al., 2020', sort: 'HARRIS C',
    entry: 'HARRIS, C. R. *et al.* Array programming with NumPy. **Nature**, London, v. 585, n. 7825, p. 357-362, 2020. DOI: 10.1038/s41586-020-2649-2.',
  },
  iec60942: {
    id: 'iec60942', cite: 'IEC, 2017', sort: 'INTERNATIONAL ELECTROTECHNICAL 2017',
    entry: 'INTERNATIONAL ELECTROTECHNICAL COMMISSION. **IEC 60942:2017**: electroacoustics – sound calibrators. 4. ed. Geneva: IEC, 2017.',
  },
  iec61260: {
    id: 'iec61260', cite: 'IEC, 2014', sort: 'INTERNATIONAL ELECTROTECHNICAL 2014',
    entry: 'INTERNATIONAL ELECTROTECHNICAL COMMISSION. **IEC 61260-1:2014**: electroacoustics – octave-band and fractional-octave-band filters – Part 1: specifications. Geneva: IEC, 2014.',
  },
  iec61672: {
    id: 'iec61672', cite: 'IEC, 2013', sort: 'INTERNATIONAL ELECTROTECHNICAL 2013',
    entry: 'INTERNATIONAL ELECTROTECHNICAL COMMISSION. **IEC 61672-1:2013**: electroacoustics – sound level meters – Part 1: specifications. 2. ed. Geneva: IEC, 2013.',
  },
  iso1683: {
    id: 'iso1683', cite: 'ISO, 2015', sort: 'INTERNATIONAL ORGANIZATION 2015',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 1683:2015**: acoustics – preferred reference values for acoustical and vibratory levels. Geneva: ISO, 2015.',
  },
  iso266: {
    id: 'iso266', cite: 'ISO, 1997', sort: 'INTERNATIONAL ORGANIZATION 1997',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 266:1997**: acoustics – preferred frequencies. Geneva: ISO, 1997.',
  },
  iso532: {
    id: 'iso532', cite: 'ISO, 2017', sort: 'INTERNATIONAL ORGANIZATION 2017',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 532-1:2017**: acoustics – methods for calculating loudness – Part 1: Zwicker method. Geneva: ISO, 2017.',
  },
  lotinga: {
    id: 'lotinga', cite: 'LOTINGA, 2025', sort: 'LOTINGA',
    entry: 'LOTINGA, M. J. B. **sottek-hearing-model**: Python implementation of the Sottek Hearing Model (ECMA-418-2). Versão 0.1.13. Salford: University of Salford, 2025. Disponível em: https://github.com/mlotinga/sottek-hearing-model. ' + ACCESS,
    url: 'https://github.com/mlotinga/sottek-hearing-model',
  },
  marple1999: {
    id: 'marple1999', cite: 'MARPLE, 1999', sort: 'MARPLE',
    entry: 'MARPLE, S. L. Computing the discrete-time analytic signal via FFT. **IEEE Transactions on Signal Processing**, [s. l.], v. 47, n. 9, p. 2600-2603, set. 1999.',
  },
  mosqito: {
    id: 'mosqito', cite: 'GREEN FORGE COOP, 2024', sort: 'GREEN',
    entry: 'GREEN FORGE COOP. **MOSQITO**: modular sound quality integrated toolbox. Versão 1.2.1. [S. l.]: Zenodo, 2024. DOI: 10.5281/zenodo.10629475.',
  },
  nordtest: {
    id: 'nordtest', cite: 'NORDTEST, 2002', sort: 'NORDTEST',
    entry: 'NORDTEST. **NT ACOU 112**: acoustics: prominence of impulsive sounds and for adjustment of LAeq. Espoo: Nordtest, 2002. Disponível em: https://www.nordtest.info/wp/2002/05/01/acoustics-prominence-of-impulsive-sounds-and-for-adjustment-of-laeq-nt-acou-112/. ' + ACCESS,
    url: 'https://www.nordtest.info/wp/2002/05/01/acoustics-prominence-of-impulsive-sounds-and-for-adjustment-of-laeq-nt-acou-112/',
  },
  oppenheim2010: {
    id: 'oppenheim2010', cite: 'OPPENHEIM; SCHAFER, 2010', sort: 'OPPENHEIM',
    entry: 'OPPENHEIM, A. V.; SCHAFER, R. W. **Discrete-time signal processing**. 3. ed. Upper Saddle River: Pearson, 2010.',
  },
  sanmillan2021: {
    id: 'sanmillan2021', cite: 'SAN MILLÁN-CASTILLO et al., 2021', sort: 'SAN MILLAN',
    entry: 'SAN MILLÁN-CASTILLO, R. *et al.* MOSQITO: an open-source and free toolbox for sound quality metrics in the industry and education. *In*: INTER-NOISE AND NOISE-CON CONGRESS AND CONFERENCE, 2021. **Proceedings** […]. [S. l.]: Institute of Noise Control Engineering, 2021.',
  },
  silveira2024tese: {
    id: 'silveira2024tese', cite: 'SILVEIRA, 2024', sort: 'SILVEIRA 2023',
    entry: 'SILVEIRA, H. A. da. **Qualidade sonora aplicada na análise de sinais impulsivos de refrigeradores**. 2024. 258 f. Tese (Doutorado em Engenharia Mecânica) – Centro Tecnológico, Programa de Pós-Graduação em Engenharia Mecânica, Universidade Federal de Santa Catarina, Florianópolis, 2024.',
  },
  silveira2024: {
    id: 'silveira2024', cite: 'SILVEIRA et al., 2024', sort: 'SILVEIRA 2024 B',
    entry: 'SILVEIRA, H. A. da *et al.* Psychoacoustic model for detecting the sensation of impulsivity in acoustic signals from refrigerators. **Applied Acoustics**, [s. l.], v. 225, art. 110198, 2024.',
  },
  silveira2026: {
    id: 'silveira2026', cite: 'SILVEIRA et al., 2026', sort: 'SILVEIRA 2026',
    entry: 'SILVEIRA, H. A. da *et al.* Discomfort prediction model for impulsive noise in household refrigerator. **Applied Acoustics**, [s. l.], v. 242, art. 111068, 2026.',
  },
  sottek2016: {
    id: 'sottek2016', cite: 'SOTTEK, 2016', sort: 'SOTTEK',
    entry: 'SOTTEK, R. A hearing model approach to time-varying loudness. **Acta Acustica united with Acustica**, [s. l.], v. 102, n. 4, p. 725-744, 2016. DOI: 10.3813/AAA.918989.',
  },
  traunmuller1990: {
    id: 'traunmuller1990', cite: 'TRAUNMÜLLER, 1990', sort: 'TRAUNMULLER',
    entry: 'TRAUNMÜLLER, H. Analytical expressions for the tonotopic sensory scale. **The Journal of the Acoustical Society of America**, [s. l.], v. 88, n. 1, p. 97-100, 1990.',
  },
  shannon1949: {
    id: 'shannon1949', cite: 'SHANNON, 1949', sort: 'SHANNON',
    entry: 'SHANNON, C. E. Communication in the presence of noise. **Proceedings of the IRE**, [s. l.], v. 37, n. 1, p. 10-21, jan. 1949.',
  },
  bendat2010: {
    id: 'bendat2010', cite: 'BENDAT; PIERSOL, 2010', sort: 'BENDAT',
    entry: 'BENDAT, J. S.; PIERSOL, A. G. **Random data**: analysis and measurement procedures. 4. ed. Hoboken: Wiley, 2010.',
  },
  w3cwebaudio: {
    id: 'w3cwebaudio', cite: 'W3C, 2021', sort: 'WORLD WIDE WEB 2021 A',
    entry: 'WORLD WIDE WEB CONSORTIUM. **Web Audio API**. W3C Recommendation. [S. l.]: W3C, 2021. Disponível em: https://www.w3.org/TR/webaudio/. ' + ACCESS,
    url: 'https://www.w3.org/TR/webaudio/',
  },
  w3cmedia: {
    id: 'w3cmedia', cite: 'W3C, [s. d.]', sort: 'WORLD WIDE WEB 2021 B',
    entry: 'WORLD WIDE WEB CONSORTIUM. **Media Capture and Streams**. [S. l.]: W3C, [s. d.]. Disponível em: https://www.w3.org/TR/mediacapture-streams/. ' + ACCESS,
    url: 'https://www.w3.org/TR/mediacapture-streams/',
  },
  virtanen2020: {
    id: 'virtanen2020', cite: 'VIRTANEN et al., 2020', sort: 'VIRTANEN',
    entry: 'VIRTANEN, P. *et al.* SciPy 1.0: fundamental algorithms for scientific computing in Python. **Nature Methods**, [s. l.], v. 17, p. 261-272, 2020. DOI: 10.1038/s41592-019-0686-2.',
  },
  zwicker1961: {
    id: 'zwicker1961', cite: 'ZWICKER, 1961', sort: 'ZWICKER 1961',
    entry: 'ZWICKER, E. Subdivision of the audible frequency range into critical bands (Frequenzgruppen). **The Journal of the Acoustical Society of America**, [s. l.], v. 33, n. 2, p. 248, 1961.',
  },
  zwicker1980: {
    id: 'zwicker1980', cite: 'ZWICKER; TERHARDT, 1980', sort: 'ZWICKER 1980',
    entry: 'ZWICKER, E.; TERHARDT, E. Analytical expressions for critical-band rate and critical bandwidth as a function of frequency. **The Journal of the Acoustical Society of America**, [s. l.], v. 68, n. 5, p. 1523-1525, 1980.',
  },
  brown1998: {
    id: 'brown1998', cite: 'BROWN; DUDA, 1998', sort: 'BROWN',
    entry: 'BROWN, C. P.; DUDA, R. O. A structural model for binaural sound synthesis. **IEEE Transactions on Speech and Audio Processing**, [s. l.], v. 6, n. 5, p. 476-488, set. 1998. DOI: 10.1109/89.709673.',
  },
  woodworth1954: {
    id: 'woodworth1954', cite: 'WOODWORTH; SCHLOSBERG, 1954', sort: 'WOODWORTH',
    entry: 'WOODWORTH, R. S.; SCHLOSBERG, H. **Experimental psychology**. Ed. rev. New York: Holt, Rinehart and Winston, 1954.',
  },
  blauert1997: {
    id: 'blauert1997', cite: 'BLAUERT, 1997', sort: 'BLAUERT',
    entry: 'BLAUERT, J. **Spatial hearing**: the psychophysics of human sound localization. Ed. rev. Cambridge: MIT Press, 1997.',
  },
  majdak2013: {
    id: 'majdak2013', cite: 'MAJDAK et al., 2013', sort: 'MAJDAK',
    entry: 'MAJDAK, P. *et al.* Spatially oriented format for acoustics: a data exchange format representing head-related transfer functions. *In*: AUDIO ENGINEERING SOCIETY CONVENTION, 134., 2013, Rome. **Proceedings** [...]. New York: AES, 2013.',
  },
  iso33821: {
    id: 'iso33821', cite: 'ISO, 2009', sort: 'INTERNATIONAL ORGANIZATION 2009',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 3382-1:2009**: acoustics – measurement of room acoustic parameters – Part 1: performance spaces. Geneva: ISO, 2009.',
  },
  iso33822: {
    id: 'iso33822', cite: 'ISO, 2008', sort: 'INTERNATIONAL ORGANIZATION 2008',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 3382-2:2008**: acoustics – measurement of room acoustic parameters – Part 2: reverberation time in ordinary rooms. Geneva: ISO, 2008.',
  },
  schroeder1965: {
    id: 'schroeder1965', cite: 'SCHROEDER, 1965', sort: 'SCHROEDER',
    entry: 'SCHROEDER, M. R. New method of measuring reverberation time. **The Journal of the Acoustical Society of America**, [s. l.], v. 37, n. 3, p. 409-412, mar. 1965.',
  },
  kuttruff2009: {
    id: 'kuttruff2009', cite: 'KUTTRUFF, 2009', sort: 'KUTTRUFF',
    entry: 'KUTTRUFF, H. **Room acoustics**. 5. ed. Abingdon: Spon Press, 2009.',
  },
  sbaf: {
    id: 'sbaf', cite: 'SUPERBESTAUDIOFRIENDS, [s. d.]', sort: 'SUPERBESTAUDIOFRIENDS',
    entry: 'SUPERBESTAUDIOFRIENDS. **Headphone measurements: frequency response**. [S. l.]: GitHub, [s. d.]. Licença CC BY 4.0. Disponível em: https://github.com/superbestaudiofriends/headphone-measurements-frequency-response. ' + ACCESS,
    url: 'https://github.com/superbestaudiofriends/headphone-measurements-frequency-response',
  },
  coat: {
    id: 'coat', cite: 'KOHNEN et al., 2020', sort: 'KOHNEN',
    entry: 'KOHNEN, M.; DENK, F.; LLORCA-BOFÍ, J.; KOLLMEIER, B.; VORLÄNDER, M. **COAT**: cross-site Oldenburg-Aachener transfer-functions. Versão 2. [S. l.]: Zenodo, 2020. Licença CC BY 4.0. DOI: 10.5281/zenodo.4556707. Disponível em: https://zenodo.org/records/4556707. ' + ACCESS,
    url: 'https://zenodo.org/records/4556707',
  },
  opra: {
    id: 'opra', cite: 'OPRA PROJECT, [s. d.]', sort: 'OPRA',
    entry: 'OPRA PROJECT. **OPRA**: open profiles for revealing audio. [S. l.]: GitHub, [s. d.]. Código sob licença MIT; dados sob licença CC BY-SA 4.0. Disponível em: https://github.com/opra-project/OPRA. ' + ACCESS,
    url: 'https://github.com/opra-project/OPRA',
  },
  // --- Preparação de áudios: bases abertas de HRTF, fones e respostas ao impulso (página planejada) ---
  algazi2001: {
    id: 'algazi2001', cite: 'ALGAZI et al., 2001', sort: 'ALGAZI',
    entry: 'ALGAZI, V. R.; DUDA, R. O.; THOMPSON, D. M.; AVENDANO, C. The CIPIC HRTF database. *In*: IEEE WORKSHOP ON APPLICATIONS OF SIGNAL PROCESSING TO AUDIO AND ACOUSTICS, 2001, New Paltz. **Proceedings** [...]. Piscataway: IEEE, 2001. p. 99-102.',
  },
  ari: {
    id: 'ari', cite: 'ACOUSTICS RESEARCH INSTITUTE, [s. d.]', sort: 'ACOUSTICS',
    entry: 'ACOUSTICS RESEARCH INSTITUTE. **HRTF database**. Vienna: Austrian Academy of Sciences, [s. d.]. Licença CC BY-SA 3.0. Disponível em: https://www.oeaw.ac.at/isf/hrtf. ' + ACCESS,
    url: 'https://www.oeaw.ac.at/isf/hrtf',
  },
  kearney2024: {
    id: 'kearney2024', cite: 'KEARNEY, 2024', sort: 'KEARNEY',
    entry: 'KEARNEY, G. C. **SADIE II database**. Versão 2-1. [S. l.]: Zenodo, 2024. Licença Apache 2.0. DOI: 10.5281/zenodo.10886409. Disponível em: https://zenodo.org/records/10886409. ' + ACCESS,
    url: 'https://zenodo.org/records/10886409',
  },
  pasanen: {
    id: 'pasanen', cite: 'PASANEN, [s. d.]', sort: 'PASANEN',
    entry: 'PASANEN, J. **AutoEq**: automatic headphone equalization from frequency responses. [S. l.]: GitHub, [s. d.]. Código sob licença MIT; a licença dos dados de medição (oratory1990, crinacle, Rtings, InnerFidelity) deve ser conferida por fonte. Disponível em: https://github.com/jaakkopasanen/AutoEq. ' + ACCESS,
    url: 'https://github.com/jaakkopasanen/AutoEq',
  },
  murphy2010: {
    id: 'murphy2010', cite: 'MURPHY; SHELLEY, 2010', sort: 'MURPHY',
    entry: 'MURPHY, D. T.; SHELLEY, S. OpenAIR: an interactive auralization web resource and database. *In*: AUDIO ENGINEERING SOCIETY CONVENTION, 129., 2010, San Francisco. **Proceedings** [...]. New York: AES, 2010. Licença definida por item (Creative Commons). Disponível em: https://www.openair.hosted.york.ac.uk/. ' + ACCESS,
    url: 'https://www.openair.hosted.york.ac.uk/',
  },
  muller2024: {
    id: 'muller2024', cite: 'MÜLLER; WOLFF, 2024', sort: 'MULLER',
    entry: 'MÜLLER, K.; WOLFF, T. **In-Car McVAMPIRE**: an in-car multichannel varying mouth position impulse response dataset. Versão 1.0. [S. l.]: Zenodo, 2024. Licença CC BY 4.0. DOI: 10.5281/zenodo.12806684. Disponível em: https://zenodo.org/records/12806684. ' + ACCESS,
    url: 'https://zenodo.org/records/12806684',
  },
  lopezballester2025: {
    id: 'lopezballester2025', cite: 'LOPEZ-BALLESTER et al., 2025', sort: 'LOPEZ',
    entry: 'LOPEZ-BALLESTER, J. *et al.* **IR64-CAR**: a dataset of impulse responses captured with a spherical microphone array for automotive acoustic research. Versão 1.0. [S. l.]: Zenodo, 2025. Licença CC BY 4.0. DOI: 10.5281/zenodo.15168578. Disponível em: https://investigacion.ujaen.es/documentos/67f62fbfc9d0c3013599a965. ' + ACCESS,
    url: 'https://investigacion.ujaen.es/documentos/67f62fbfc9d0c3013599a965',
  },
  ebrird: {
    id: 'ebrird', cite: 'UNIVERSITY COLLEGE LONDON, [s. d.]', sort: 'UNIVERSITY COLLEGE',
    entry: 'UNIVERSITY COLLEGE LONDON. **eBrIRD**: ELOSPHERES binaural room impulse response database. London: UCL, [s. d.]. Cenas: câmara anecoica, restaurante, cozinha e (em preparação) cabine de carro. Disponível em: https://www.phon.ucl.ac.uk/resource/ebrird. ' + ACCESS,
    url: 'https://www.phon.ucl.ac.uk/resource/ebrird',
  },
  jeub2009: {
    id: 'jeub2009', cite: 'JEUB; SCHÄFER; VARY, 2009', sort: 'JEUB',
    entry: 'JEUB, M.; SCHÄFER, M.; VARY, P. A binaural room impulse response database for the evaluation of dereverberation algorithms. *In*: INTERNATIONAL CONFERENCE ON DIGITAL SIGNAL PROCESSING, 16., 2009, Santorini. **Proceedings** [...]. Piscataway: IEEE, 2009. Disponível em: https://www.iks.rwth-aachen.de/en/research/tools-downloads/databases/aachen-impulse-response-database. ' + ACCESS,
    url: 'https://www.iks.rwth-aachen.de/en/research/tools-downloads/databases/aachen-impulse-response-database',
  },
  szoke2019: {
    id: 'szoke2019', cite: 'SZÖKE et al., 2019', sort: 'SZOKE',
    entry: 'SZÖKE, M. *et al.* Building and evaluation of a real room impulse response dataset. **IEEE Journal of Selected Topics in Signal Processing**, [s. l.], v. 13, n. 4, 2019. Licença CC BY 4.0. Disponível em: https://speech.fit.vut.cz/software/but-speech-fit-reverb-database. ' + ACCESS,
    url: 'https://speech.fit.vut.cz/software/but-speech-fit-reverb-database',
  },
  dicarlo2021: {
    id: 'dicarlo2021', cite: 'DI CARLO et al., 2021', sort: 'DI CARLO',
    entry: 'DI CARLO, D. *et al.* dEchorate: a calibrated room impulse response dataset for echo-aware signal processing. **EURASIP Journal on Audio, Speech, and Music Processing**, [s. l.], 2021. DOI: 10.1186/s13636-021-00229-0.',
  },
}

export const sortRefs = (ids: string[]): Ref[] =>
  [...new Set(ids)].map((id) => REFS[id]).filter(Boolean).sort((a, b) => a.sort.localeCompare(b.sort, 'pt'))
