Super easy setup.

First .env.example -> .env and set the admin password.

Then docker compose up --build -d where you want it.

It has caddy so it's set up to run on localhost without any port number.

That's basically it. Then you just need to go into the UI and add a class if you haven't yet.

Worked fine on 1GB ram on a $6/month digital ocean droplet.