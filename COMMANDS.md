# Commands (Windows Command Prompt)

Replace `YOUR-USER`, `YOUR-REPO` and the folder paths with your own. Run these in **Command Prompt** (cmd).
Install Git (https://git-scm.com) and Node.js 20 or newer (https://nodejs.org) first.

## A. First time: send this folder to a NEW GitHub repository
Create an empty **private** repository on github.com first (no README), then:

```
cd C:\Users\YOU\Downloads\salary-dashboard-updated
git init
git add .
git commit -m "Salary dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

## B. Update an EXISTING repository with this new version
1. Get your repository onto your computer (skip if you already have the folder):

```
cd C:\Users\YOU\Documents
git clone https://github.com/YOUR-USER/YOUR-REPO.git
```

2. Copy everything from the new `salary-dashboard-updated` folder INTO the repository folder and choose **Replace** when asked
   (do not copy a `.git` folder or `node_modules`). Then:

```
cd C:\Users\YOU\Documents\YOUR-REPO
git status
git add .
git commit -m "Add custom date range, period comparisons, MIS Others mapping, login fix"
git push
```

If the push is rejected because the repository has newer changes:

```
git pull --rebase origin main
git push
```

**Vercel redeploys automatically after every push to `main`.** Watch it under Deployments in the Vercel dashboard.

## C. Run it on your own computer (optional)

```
cd C:\Users\YOU\Documents\YOUR-REPO
copy .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. Run the tests with:

```
npm test
```

## D. Deploy from the command line instead of GitHub (optional)

```
npm install -g vercel
vercel login
vercel --prod
```
