export async function fetchAnalysisAndExplanations(
  code: string,
  filename: string
) {
  const form = new FormData();
  // The backend expects a file for /analyze/
  form.append("file", new File([code], filename));
  const res = await fetch("http://127.0.0.1:8000/analyze/", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Analysis failed");
  const data = await res.json();
  return data.results; // Array of { issue, explanation }
}

export async function fetchExplanation(code: string, issue?: string) {
  const form = new FormData();
  form.append("code", code);
  if (issue) form.append("issue", issue);
  const res = await fetch("http://127.0.0.1:8000/explain/", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Explanation failed");
  const data = await res.json();
  return data.explanation; // String
}
