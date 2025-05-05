const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
dotenv.config();

const app = express();
const port = 3000;

// Init Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Test de base
app.get("/", (req, res) => {
  res.send("CoachGPT backend connecté à Strava + Supabase !");
});

// Connexion Strava : récupère les tokens et les stocke
app.get("/auth/strava/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post("https://www.strava.com/oauth/token", null, {
      params: {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
      },
    });

    const { access_token, refresh_token, expires_at, athlete } = response.data;
    const user_email = athlete.email || `user-${athlete.id}@coachgpt.app`; // fallback si pas d'email

    // Enregistre ou met à jour le token dans Supabase
    const { error } = await supabase
      .from('users_tokens')
      .upsert({
        email: user_email,
        access_token,
        refresh_token,
        expires_at,
      });

    if (error) {
      console.error("Erreur Supabase :", error);
      return res.status(500).send("Erreur enregistrement tokens");
    }

    res.send(`Connexion réussie pour ${user_email} !`);
  } catch (error) {
    console.error("Erreur callback Strava :", error.response?.data || error.message);
    res.status(500).send("Erreur lors de la connexion à Strava");
  }
});

// Récupère les dernières activités d'un utilisateur via son email
app.get("/strava/activities", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).send("Email manquant");

  const { data, error } = await supabase
    .from('users_tokens')
    .select('access_token')
    .eq('email', email)
    .single();

  if (error || !data) {
    console.error("Erreur token :", error);
    return res.status(404).send("Utilisateur non trouvé");
  }

  try {
    const response = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
      },
      params: { per_page: 3 },
    });

    res.json(response.data);
  } catch (err) {
    console.error("Erreur récupération activités :", err.response?.data || err.message);
    res.status(500).send("Erreur récupération activités");
  }
});

app.listen(port, () => {
  console.log(`✅ Serveur prêt sur http://localhost:${port}`);
});
