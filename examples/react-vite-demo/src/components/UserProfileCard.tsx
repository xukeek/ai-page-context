import { Avatar } from './Avatar';
import { UserInfo } from './UserInfo';

type User = {
  name: string;
  title: string;
  avatar: string;
  bio: string;
};

type Props = {
  user: User;
};

export function UserProfileCard({ user }: Props) {
  return (
    <article className="profile-card">
      <Avatar src={user.avatar} alt={user.name} />
      <UserInfo name={user.name} title={user.title} bio={user.bio} />
    </article>
  );
}
