type Props = {
  name: string;
  title: string;
  bio: string;
};

export function UserInfo({ name, title, bio }: Props) {
  return (
    <div className="user-info">
      <h2>{name}</h2>
      <p>{title}</p>
      <p>{bio}</p>
      <div className="actions">
        <button type="button" className="primary">
          Follow
        </button>
        <button type="button" className="ghost">
          Message
        </button>
      </div>
    </div>
  );
}
