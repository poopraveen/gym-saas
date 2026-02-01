# Add This Project to GitHub

## Step 1: Install Git (if needed)

1. Download Git: https://git-scm.com/download/win  
2. Run the installer (default options are fine)  
3. Close and reopen your terminal/Cursor after installing  

---

## Step 2: Create a repo on GitHub

1. Go to https://github.com/new  
2. **Repository name**: `gym-saas` (or any name)  
3. **Public**  
4. **Do NOT** check "Add a README"  
5. Click **Create repository**  

---

## Step 3: Edit the script and run it

1. Open `push-to-github.ps1` in this folder  
2. Replace `YOUR_USERNAME` with your GitHub username  
3. Replace `YOUR_REPO_NAME` with your repo name (e.g. `gym-saas`)  

   Example: `https://github.com/johndoe/gym-saas.git`

4. Open **PowerShell** or **Terminal** in this folder  
5. Run:
   ```
   .\push-to-github.ps1
   ```

---

## Step 4: Push (you must do this)

Run:
```
git push -u origin main
```

- **Username**: your GitHub username  
- **Password**: use a **Personal Access Token**, not your GitHub password  
  - GitHub → Settings → Developer settings → Personal access tokens  
  - Generate new token (classic), check `repo` scope  
  - Copy the token and paste it when prompted for password  

---

## Or do it manually

```powershell
cd c:\Users\hp\Desktop\GymOrg\gym-saas

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gym-saas.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.
