/* Backend layer. Two implementations behind one API:
 *  - SupabaseBackend: real auth + database + file storage (production).
 *  - DemoBackend: localStorage, synthetic accounts, for previews only.
 * Every page calls window.backend.* and never touches either directly. */
(function () {
  const cfg = window.APP_CONFIG;
  const useReal = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  const api = {
    mode: useReal ? "live" : "demo",
    // session
    async signIn(username, password) {},
    async signOut() {},
    async getSession() { return null; }, // {role:'student'|'teacher', name, id}
    // student
    async listAssignments() { return []; },
    async mySubmissions() { return []; },
    async myGrades() { return []; },
    async submitWork(assignmentId, file, note) {},
    assignmentFileUrl(a) { return a.file_url || null; },
    // teacher
    async listStudents() { return []; },
    async createAssignment(title, description, dueDate, file) {},
    async listSubmissions(assignmentId) { return []; },
    submissionFileUrl(s) { return s.file_url || null; },
    async saveGrade(studentId, quizName, score, maxScore) {},
    async allGrades() { return []; },
  };

  /* ---------------- Demo backend (synthetic data, browser only) -------------- */
  function DemoBackend() {
    const KEY = "abulenoor_demo_v1";
    const demoUsers = [{ id: "t1", role: "teacher", username: "teacher", password: "teacher123", name: "Dr. Osama" }];
    for (let i = 1; i <= 40; i++) {
      const n = String(i).padStart(2, "0");
      demoUsers.push({ id: "s" + i, role: "student", username: "student" + n, password: "demo123", name: "Demo Student " + n });
    }
    const blank = {
      users: demoUsers,
      assignments: [
        { id: 1, title: "Sample: Descriptive Writing Task", description: "Demo assignment. Write 350-450 words describing a place that matters to you. Focus on sensory detail and varied sentence structure.", due_date: "2026-11-28", file_url: null, created_at: "2026-11-20" },
        { id: 2, title: "Sample: Reading Comprehension — Book 1", description: "Demo assignment. Answer questions 1-6 from the Unit 4 text. Show evidence for every answer.", due_date: "2026-12-02", file_url: null, created_at: "2026-11-21" },
      ],
      submissions: [],
      grades: [
        { id: 1, student_id: "s1", quiz_name: "Sample Quiz: Tenses", score: 8, max_score: 10, graded_at: "2026-11-15" },
        { id: 2, student_id: "s1", quiz_name: "Sample Quiz: Vocabulary 3", score: 6, max_score: 10, graded_at: "2026-11-18" },
      ],
      session: null,
      seq: 100,
    };
    const load = () => JSON.parse(localStorage.getItem(KEY) || "null") || structuredClone(blank);
    const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
    const sess = () => load().session;

    api.signIn = async (username, password) => {
      const s = load();
      const u = s.users.find((x) => x.username === username.trim().toLowerCase() && x.password === password);
      if (!u) throw new Error("Wrong username or password.");
      s.session = { id: u.id, role: u.role, name: u.name, username: u.username };
      save(s); return s.session;
    };
    api.signOut = async () => { const s = load(); s.session = null; save(s); };
    api.getSession = async () => sess();
    api.listAssignments = async () => load().assignments.slice().sort((a, b) => b.id - a.id);
    api.mySubmissions = async () => { const s = load(); return s.submissions.filter((x) => x.student_id === s.session.id); };
    api.myGrades = async () => { const s = load(); return s.grades.filter((g) => g.student_id === s.session.id); };
    api.submitWork = async (assignmentId, file, note) => {
      const s = load();
      if (s.submissions.some((x) => x.assignment_id === assignmentId && x.student_id === s.session.id))
        throw new Error("You already submitted this assignment.");
      s.submissions.push({ id: ++s.seq, assignment_id: assignmentId, student_id: s.session.id, file_name: file ? file.name : null, note: note || "", submitted_at: new Date().toISOString() });
      save(s);
    };
    api.listStudents = async () => load().users.filter((u) => u.role === "student").map(({ id, name, username }) => ({ id, name, username }));
    api.createAssignment = async (title, description, dueDate, file) => {
      const s = load();
      s.assignments.push({ id: ++s.seq, title, description, due_date: dueDate || null, file_name: file ? file.name : null, file_url: null, created_at: new Date().toISOString().slice(0, 10) });
      save(s);
    };
    api.listSubmissions = async (assignmentId) => {
      const s = load();
      return s.submissions.filter((x) => x.assignment_id === assignmentId).map((x) => {
        const st = s.users.find((u) => u.id === x.student_id);
        return { ...x, student_name: st ? st.name : x.student_id };
      });
    };
    api.saveGrade = async (studentId, quizName, score, maxScore) => {
      const s = load();
      s.grades.push({ id: ++s.seq, student_id: studentId, quiz_name: quizName, score: Number(score), max_score: Number(maxScore), graded_at: new Date().toISOString().slice(0, 10) });
      save(s);
    };
    api.allGrades = async () => {
      const s = load();
      return s.grades.map((g) => { const st = s.users.find((u) => u.id === g.student_id); return { ...g, student_name: st ? st.name : g.student_id }; });
    };
  }

  /* ---------------- Supabase backend (production) ---------------- */
  function SupabaseBackend() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const emailFor = (username) => username.trim().toLowerCase() + "@" + cfg.STUDENT_EMAIL_DOMAIN;

    async function profile() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const { data: t } = await sb.from("teachers").select("id").eq("id", user.id).maybeSingle();
      if (t) return { id: user.id, role: "teacher", name: "Dr. Osama" };
      const { data: st } = await sb.from("students").select("*").eq("id", user.id).single();
      return st ? { id: user.id, role: "student", name: st.full_name, username: st.username } : null;
    }
    async function signedUrl(bucket, path) {
      if (!path) return null;
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
      return error ? null : data.signedUrl;
    }
    async function upload(bucket, path, file) {
      const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      return path;
    }

    api.signIn = async (username, password) => {
      const { error } = await sb.auth.signInWithPassword({ email: emailFor(username), password });
      if (error) throw new Error("Wrong username or password.");
      const p = await profile();
      if (!p) { await sb.auth.signOut(); throw new Error("This account is not registered on the platform."); }
      return p;
    };
    api.signOut = async () => sb.auth.signOut();
    api.getSession = async () => profile();
    api.listAssignments = async () => {
      const { data, error } = await sb.from("assignments").select("*").order("id", { ascending: false });
      if (error) throw new Error(error.message);
      for (const a of data) a.file_url = await signedUrl("assignments", a.file_path);
      return data;
    };
    api.mySubmissions = async () => {
      const me = await profile();
      const { data, error } = await sb.from("submissions").select("*").eq("student_id", me.id);
      if (error) throw new Error(error.message);
      return data;
    };
    api.myGrades = async () => {
      const me = await profile();
      const { data, error } = await sb.from("quiz_grades").select("*").eq("student_id", me.id).order("graded_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    };
    api.submitWork = async (assignmentId, file, note) => {
      const me = await profile();
      let path = null;
      if (file) path = await upload("submissions", me.id + "/" + assignmentId + "/" + Date.now() + "_" + file.name, file);
      const { error } = await sb.from("submissions").insert({ assignment_id: assignmentId, student_id: me.id, file_path: path || "", note: note || "" });
      if (error) throw new Error(error.message.includes("duplicate") ? "You already submitted this assignment." : error.message);
    };
    api.listStudents = async () => {
      const { data, error } = await sb.from("students").select("id,username,full_name").order("username");
      if (error) throw new Error(error.message);
      return data.map((s) => ({ id: s.id, name: s.full_name, username: s.username }));
    };
    api.createAssignment = async (title, description, dueDate, file) => {
      let path = null;
      if (file) path = await upload("assignments", Date.now() + "_" + file.name, file);
      const { error } = await sb.from("assignments").insert({ title, description, due_date: dueDate || null, file_path: path });
      if (error) throw new Error(error.message);
    };
    api.listSubmissions = async (assignmentId) => {
      const { data, error } = await sb.from("submissions").select("*, students(full_name)").eq("assignment_id", assignmentId);
      if (error) throw new Error(error.message);
      for (const s of data) { s.student_name = s.students ? s.students.full_name : ""; s.file_url = await signedUrl("submissions", s.file_path); }
      return data;
    };
    api.saveGrade = async (studentId, quizName, score, maxScore) => {
      const { error } = await sb.from("quiz_grades").insert({ student_id: studentId, quiz_name: quizName, score: Number(score), max_score: Number(maxScore) });
      if (error) throw new Error(error.message);
    };
    api.allGrades = async () => {
      const { data, error } = await sb.from("quiz_grades").select("*, students(full_name)").order("graded_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data.map((g) => ({ ...g, student_name: g.students ? g.students.full_name : "" }));
    };
  }

  if (useReal) SupabaseBackend(); else DemoBackend();
  window.backend = api;
})();
