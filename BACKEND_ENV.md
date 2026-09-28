# ServiGo Backend Environment

## Python interpreter (venv)

```
D:\Abilabs\ServiGo\venv\Scripts\python.exe
```

## Activate the venv

**Windows (cmd / PowerShell):**
```
venv\Scripts\activate
```

**Git Bash / bash:**
```bash
source venv/Scripts/activate
```

## Run the dev server on port 8004

```bash
python manage.py runserver 8004
```

## Verify you are using the correct interpreter

```bash
python -c "import sys; print(sys.executable)"
# Should print: D:\Abilabs\ServiGo\venv\Scripts\python.exe
```

## Verify all API dependencies are importable

```bash
python -c "import rest_framework, corsheaders, rest_framework_simplejwt, drf_spectacular; print('all ok')"
```

## Install / sync dependencies

```bash
pip install -r requirements.txt
```
