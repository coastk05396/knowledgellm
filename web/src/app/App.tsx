import { appConfig } from "./config";

export default function App() {
  return (
    <main>
      <h1>{appConfig.title}</h1>
      <p>Sign in to see the documents you can access.</p>
      <button type="button">Sign in</button>
    </main>
  );
}
