/* Backend layer: Supabase auth + database + file storage.
 * Every page calls window.backend.* and never touches it directly. */
(function () {
  const cfg = window.APP_CONFIG;
  const useReal = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  const api = {
    mode: "live",
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

  if (!useReal) throw new Error("APP_CONFIG is missing the Supabase project settings.");
  SupabaseBackend();
  window.backend = api;
})();
