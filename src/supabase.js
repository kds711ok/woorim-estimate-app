import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://uriwjrrysidkjxabbgnq.supabase.co";
const supabaseKey = "sb_publishable_ChP7ihAm4q2rm3V2BHGmsQ_SrVnlrE3";

export const supabase = createClient(supabaseUrl, supabaseKey);