const SUPABASE_URL = "https://btzheezlvxkyemkactvj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_vOhFbevQUsseGs-oQgm0JQ_8t6Oi1Sh";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


let anonymousUserPromise = null;
function initAnonymousUser() {
    if (!anonymousUserPromise) {
        anonymousUserPromise = (async () => {
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            if (data.session?.user) return data.session.user;
            const result = await supabaseClient.auth.signInAnonymously();
            if (result.error) throw result.error;
            if (!result.data.user) throw new Error("Anonymous login returned no user");
            return result.data.user;
        })().catch(error => { anonymousUserPromise = null; throw error; });
    }
    return anonymousUserPromise;
}
