type Props = {
  src: string;
  alt: string;
};

export function Avatar({ src, alt }: Props) {
  return <img className="avatar" src={src} alt={alt} />;
}
