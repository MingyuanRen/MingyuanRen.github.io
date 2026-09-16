export type Entry = { title: string; description?: string; href?: string };

// Fill in these values when you are ready. Empty fields are not rendered.
export const profile = {
  name: "",
  bio: "",
  avatarUrl: "",
  email: "",
  links: [] as { label: string; href: string }[],
};

export const sections: { id: string; label: string; entries: Entry[] }[] = [
  { id: "now", label: "NOW", entries: [] },
  { id: "learning", label: "LEARNING", entries: [] },
  { id: "technology", label: "TECH", entries: [] },
  { id: "culture", label: "CULTURE", entries: [] },
];
