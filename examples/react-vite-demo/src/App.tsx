import { UserProfileCard } from './components/UserProfileCard';

export function App() {
  return (
    <main className="page">
      <section className="hero">
        <h1>AI Page Context Demo</h1>
        <p>用扩展点选这张卡片，截图标注后通过 MCP 拉取 Issue。</p>
      </section>
      <UserProfileCard
        user={{
          name: 'Ada Lovelace',
          title: 'Analytical Engine Architect',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
          bio: '间距故意偏大，方便演示「这里的间距太大」。',
        }}
      />
      <div className="note">
        1) pnpm dev:mcp（项目根为 examples/react-vite-demo 或本仓库）
        <br />
        2) 加载扩展 packages/extension/.output/chrome-mv3-dev
        <br />
        3) 打开本页 → 侧栏新建标注 → Cursor list_issues / get_issue
      </div>
    </main>
  );
}
