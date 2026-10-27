/** Re-mounted on every navigation, so each page gently fades up on arrival. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter flex flex-1 flex-col">{children}</div>;
}
