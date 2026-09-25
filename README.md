# Spool — Filament Studio

A local filament inventory app with a responsive interface. Run it with Docker. No account required.

## Start with Docker

Install and start Docker Desktop with Linux containers enabled (or use Docker Engine with the Compose plugin on Linux). From this folder, run:

```sh
docker compose up -d --build
```

Open **http://localhost:3000** in your browser. The container serves the app using a Node.js server and restarts automatically unless you stop it. The first build needs internet access to download the base image; the app itself has no external dependencies.

Useful commands:

```sh
# Check container status and health
docker compose ps

# View server logs
docker compose logs -f

# Stop and remove the container
docker compose down

# Rebuild after editing the app
docker compose up -d --build
```

Port 3000 is available on the PC's network interfaces. On another device on the same network, open `http://<PC-IP>:3000`. Use `ipconfig` on Windows to find the IPv4 address of your active Ethernet or Wi-Fi adapter. If needed, allow inbound TCP port 3000 on your private network. To change the port, edit the first number in `3000:8080` in `compose.yaml`.

### Shared storage

Inventory and print history are stored in `/data/inventory.json` inside the named Docker volume `spool-data` (Compose prefixes the volume name with the project name). Every browser connecting to this server uses the same collection. Open pages refresh every five seconds when a dialog is not being edited. If two browsers edit the same inventory version, the second save is rejected and must be retried after refreshing, preventing silent overwrites.

Rebuilding the image or running `docker compose down` preserves the volume. **Do not use `docker compose down -v` unless you intend to delete the inventory.** Keep the same Compose project name/folder to reuse the same volume. Export backups regularly; importing a backup replaces the shared inventory for everyone.

### Migrate existing browser inventory

1. Before upgrading, export a backup from the browser containing your inventory.
2. Run `docker compose up -d --build` and reload the page.
3. Use **Import backup** to load that file into shared storage once.
4. Open the app from any browser or device to see the same collection.


## Features

- Add, edit, and delete spools with brand, material, color, diameter, location, and notes.
- Choose a common filament brand from the Brand dropdown, or select **Other** to enter your own. Existing custom brand names are preserved when editing or restoring backups.
- Track original and remaining filament weight in grams. Enter filament weight excluding the empty spool.
- In Add/Edit filament, use **Update from a scale** to enter the measured weight (spool plus filament) and empty spool weight. Remaining filament is calculated automatically and applied on save. For example, 875 g measured minus a 250 g empty spool leaves 625 g filament. The empty spool weight is remembered for future measurements. The last scale reading is shown separately; editing a spool later does not reapply an old reading after prints have used filament. Leave measured weight blank to enter remaining filament manually.
- Log completed prints to deduct filament automatically; undo a log to restore its weight.
- Search your collection, filter material and stock level, and sort by name, weight, or date added.
- Stock cards flag spools at or below 20% remaining; empty spools have their own filter.
- Review print history, including records for deleted spools.
- Export and restore JSON backups. Restoring a backup replaces the current collection and history.
- Optionally load clearly labeled sample inventory from the initial empty screen.

## Your data

The server is the source of truth; inventory is not stored in the browser. Successful saves are written to the volume before the app confirms them. Failed saves show an error and do not pretend to be saved locally. The app is intended for a trusted local network: anyone who can reach it can view and edit the shared collection. There is no account system or cloud service.

Edits to remaining weight are manual stock corrections and do not create print logs. Undoing a print is blocked if restoring its weight would exceed the spool’s original weight. Deleting a spool keeps its historical print records but prevents restoring weight to that spool.

## Development

The app uses plain HTML, CSS, and JavaScript with a dependency-free Node.js server. Run locally with Node.js 22 or later:

```sh
node server.cjs
```

Open `http://localhost:8080`. By default, local server data goes into the ignored `data/` directory. `DATA_DIR` and `PORT` can override these defaults. The Docker image sets `DATA_DIR=/data` and `PORT=8080`.

Run `node --check app.js` for syntax validation and `node --test app.test.cjs server.test.cjs` for client workflows, persistence, validation, and concurrent-save tests. `data.js` provides shared browser/server validation. All visual assets are available offline.
