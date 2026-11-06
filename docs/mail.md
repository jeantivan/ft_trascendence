# Test mail inbox

[Mailpit](https://mailpit.axllent.org/) is a test inbox: mail sent to it never leaves Docker. The app will send its mail there (for example, the one-time code to delete an account) once its sending code lands with #34.

## Reading the mail

Open `/mailpit/` at the address you use for the app, for example `https://localhost:8443/mailpit/`.

- **User:** `demo`
- **Password:** `MAILPIT_PASSWORD` in `.env`. `make` and `make dev` generate it the first time.

It asks for a password because the mail carries one-time codes, and the app can be opened from other computers on the network.

## How it is set up

- `mailpit` is a service in `docker-compose.yml`, so it runs with both `make` and `make dev`. It publishes no ports: only nginx does.
- `SMTP_HOST`, `SMTP_PORT` and `MAIL_FROM` (`.env.example`) reach the app, for its sending code to use.
- It has no volume: the mail is lost when the container is recreated. To change the password, edit `.env` and run `make` again.
