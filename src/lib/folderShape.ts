// Shared silhouette for the photo frame and the folder it becomes.
export const folderContour = 'M.038 0H.516C.532 0 .537 .008 .55 .024L.599 .085Q.612 .10 .629 .10H.963Q1 .10 1 .166V.936Q1 1 .963 1H.086Q.066 1 .054 .975L.012 .878Q0 .853 0 .824V.065Q0 0 .038 0Z';
export const folderMask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path fill="white" d="${folderContour}"/></svg>`)}")`;

// A shallower photo edge keeps the opening portrait's folder cuts in scale.
// The main folder silhouette stays unchanged for the other photos and flight.
export const portraitPhotoContour = 'M.038 0H.516C.532 0 .537 .004 .55 .010L.599 .036Q.612 .042 .629 .042H.963Q1 .042 1 .066V.976Q1 1 .963 1H.060Q.046 1 .038 .990L.008 .956Q0 .946 0 .934V.024Q0 0 .038 0Z';
export const portraitPhotoMask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path fill="white" d="${portraitPhotoContour}"/></svg>`)}")`;
