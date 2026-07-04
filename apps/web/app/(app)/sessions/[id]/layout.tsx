import styles from "./session-detail.module.css";

export default function SessionDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.layoutRoot} data-no-bottom-nav>
      {children}
    </div>
  );
}
