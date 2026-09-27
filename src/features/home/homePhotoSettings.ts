import firstHomePhoto from '../../assets/sky/hololens-demo.jpg';

export { firstHomePhoto };
export const homePhotoWidths = [320, 640, 960, 1280, 1600];
// Match the portrait's displayed size so it does not download a landscape-sized image.
export const firstHomePhotoSizes = '(max-width: 900px) 64vw, (max-height: 600px) 34vh, 30vw';
