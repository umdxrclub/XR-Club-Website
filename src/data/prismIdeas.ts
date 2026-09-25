export const prismTitle = ['Ideas', 'take', 'shape.'] as const;

export type PrismIdea = { name: string; partner: string; line: string };

/** The three ideas the glass prism opens into. Wording follows projects.json. */
export const prismIdeas: readonly PrismIdea[] = [
  { name: 'Project ARIA', partner: 'Meta Reality Labs', line: 'Research glasses that read a conversation from the wearer’s point of view.' },
  { name: 'The Rosetta Engine', partner: 'Brain-computer interface', line: 'Neural signals from an Emotiv headset, decoded toward visual thought.' },
  { name: 'Tactura', partner: 'Doublepoint', line: 'Wrist gestures on a smartwatch that turn sign language into speech.' },
];
