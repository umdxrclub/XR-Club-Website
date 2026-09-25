type Point = [number, number];
type Segment = { command: string; points: Point[] };

/** A projected folder opening over an image that stays fixed in screen space. */
export function createPhotoWindow(contour: string) {
  const tokens = contour.match(/[MLHVQZ]|-?(?:\d*\.)?\d+/g)!;
  const segments: Segment[] = [];
  let cursor = 0, x = 0, y = 0;
  const number = () => Number(tokens[cursor++]);
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === 'Z') segments.push({ command, points: [] });
    else if (command === 'Q') {
      const control: Point = [number(), number()];
      x = number(); y = number();
      segments.push({ command, points: [control, [x, y]] });
    } else {
      if (command === 'H') x = number();
      else if (command === 'V') y = number();
      else { x = number(); y = number(); }
      segments.push({ command: command === 'M' ? 'M' : 'L', points: [[x, y]] });
    }
  }
  return (width: number, height: number, yaw: number, scale: number) => {
    const angle = yaw * Math.PI / 180;
    const perspective = Math.max(width, height) * 6;
    const project = ([x, y]: Point) => {
      const localX = (x - .5) * width * scale;
      const localY = (y - .5) * height * scale;
      const depth = perspective / (perspective + Math.sin(angle) * localX);
      return `${(width / 2 + Math.cos(angle) * localX * depth).toFixed(3)} ${(height / 2 + localY * depth).toFixed(3)}`;
    };
    return segments.map(segment => segment.command + segment.points.map(project).join(' ')).join('');
  };
}