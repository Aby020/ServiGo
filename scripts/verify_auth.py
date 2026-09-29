"""
End-to-end verification of the ServiGo authentication flow + Smart TV image.

Runs against a live dev server (default http://127.0.0.1:8002) using real
HTTP requests with cookie handling and CSRF tokens — the same way a browser
would interact with the site.

Usage:
    python scripts/verify_auth.py [base_url]
"""
import http.cookiejar
import sys
import urllib.parse
import urllib.request
from urllib.error import HTTPError

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do NOT follow redirects — we want to inspect the raw 3xx responses."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

PASS, FAIL = 0, 0
results = []


def report(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        results.append(f"  PASS: {name}")
    else:
        FAIL += 1
        results.append(f"  FAIL: {name}" + (f"  <- {detail}" if detail else ""))


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            NoRedirect(),
        )

    def get(self, path):
        req = urllib.request.Request(BASE + path)
        try:
            resp = self.opener.open(req)
            return resp.status, resp.geturl(), resp.read().decode("utf-8", "replace"), resp.headers
        except HTTPError as e:
            body = e.read().decode("utf-8", "replace") if hasattr(e, "read") else ""
            return e.code, "", body, e.headers

    def csrf(self, path):
        status, _, _, headers = self.get(path)
        token = None
        for c in self.jar:
            if c.name == "csrftoken":
                token = c.value
        return token

    def post_form(self, path, data, referer=None):
        payload = urllib.parse.urlencode(data).encode()
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        if referer:
            headers["Referer"] = referer
        req = urllib.request.Request(BASE + path, data=payload, headers=headers)
        try:
            resp = self.opener.open(req)
            return resp.status, resp.geturl(), resp.read().decode("utf-8", "replace"), resp.headers
        except HTTPError as e:
            body = e.read().decode("utf-8", "replace") if hasattr(e, "read") else ""
            return e.code, "", body, e.headers

    def location(self, headers):
        return headers.get("Location", "")


def login(client, username, password):
    token = client.csrf("/accounts/login/")
    status, _, _, headers = client.post_form(
        "/accounts/login/",
        {"csrfmiddlewaretoken": token, "username": username, "password": password},
        referer=BASE + "/accounts/login/",
    )
    return status, client.location(headers), headers


def register(client, **fields):
    token = client.csrf("/accounts/register/")
    data = {
        "csrfmiddlewaretoken": token,
        "username": fields.get("username", ""),
        "email": fields.get("email", ""),
        "role": fields.get("role", "customer"),
        "phone": fields.get("phone", ""),
        "password1": fields.get("password1", ""),
        "password2": fields.get("password2", ""),
    }
    return client.post_form("/accounts/register/", data, referer=BASE + "/accounts/register/")


def db_check(code):
    """Run a Django shell snippet and return the last non-empty output line."""
    import subprocess
    out = subprocess.run(
        [sys.executable, "manage.py", "shell", "-c", code],
        capture_output=True, text=True, cwd=r"D:\AbiLabs\ServiGo",
    ).stdout.strip()
    lines = [ln for ln in out.splitlines() if ln.strip()]
    return lines[-1].strip() if lines else ""


def main():
    PW = "Strongpass123!"
    print("=" * 60)
    print("SERVIGO AUTH + SMART TV VERIFICATION")
    print(f"target: {BASE}")
    print("=" * 60)

    # Clean up any users a previous run left behind so registration is fresh.
    db_check(
        "from accounts.models import User;"
        "User.objects.filter(email__in=['verify_cust@servigo.com', 'wannabe_admin@servigo.com']).delete()"
    )

    # ---------- REGISTRATION ----------
    print("\n--- REGISTRATION ---")
    c = Client()
    status, _, body, headers = register(
        c, username="verify_cust", email="verify_cust@servigo.com",
        role="customer", phone="", password1=PW, password2=PW,
    )
    report("register valid customer -> redirect to login", status == 302 and headers.get("Location") == "/accounts/login/", f"status={status} loc={headers.get('Location','')}")
    report("register shows success message (messages cookie set)", any(m.name == "messages" for m in c.jar), "")

    # user created? (query the DB via the app's own ORM)
    out = db_check(
        "from accounts.models import User;"
        "u=User.objects.filter(email='verify_cust@servigo.com').first();"
        "print('created' if u and u.role=='customer' and u.password.startswith('pbkdf2') else 'missing')"
    )
    report("user created in DB (role=customer, hashed password)", out == "created", out)

    # duplicate email
    status, loc, body, headers = register(
        c, username="dup_email", email="customer@servigo.com",
        role="customer", phone="", password1=PW, password2=PW,
    )
    report("duplicate email -> error page (no crash)",
           status == 200 and "already exists" in body, f"status={status}")

    # duplicate username
    status, loc, body, headers = register(
        c, username="customer1", email="dup_user@servigo.com",
        role="customer", phone="", password1=PW, password2=PW,
    )
    report("duplicate username -> error page (no crash)",
           status == 200 and ("already" in body or "exists" in body or "taken" in body), f"status={status}")

    # password mismatch
    status, loc, body, headers = register(
        c, username="mismatch", email="mismatch@servigo.com",
        role="customer", phone="", password1=PW, password2="Different123!",
    )
    report("password mismatch -> validation error", status == 200, f"status={status}")

    # weak password
    status, loc, body, headers = register(
        c, username="weakpass", email="weakpass@servigo.com",
        role="customer", phone="", password1="123", password2="123",
    )
    report("weak password -> validation error (no crash)", status == 200, f"status={status}")

    # missing required field
    status, loc, body, headers = register(
        c, username="", email="missing@servigo.com",
        role="customer", phone="", password1=PW, password2=PW,
    )
    report("missing required field -> validation error", status == 200, f"status={status}")

    # admin role blocked from public registration (security fix)
    status, loc, body, headers = register(
        c, username="wannabe_admin", email="wannabe_admin@servigo.com",
        role="admin", phone="", password1=PW, password2=PW,
    )
    out = db_check(
        "from accounts.models import User;"
        "print(User.objects.filter(email='wannabe_admin@servigo.com').exists())"
    )
    report("public registration cannot create admin (security fix)", out == "False", f"admin created={out}")

    # ---------- LOGIN ----------
    print("\n--- LOGIN ---")
    c = Client()
    status, loc, headers = login(c, "verify_cust@servigo.com", PW)
    report("login new user by EMAIL -> customer dashboard", status == 302 and loc == "/dashboard/customer/", f"status={status} loc={loc}")
    report("session cookie created", any(m.name == "sessionid" for m in c.jar), "")

    c = Client()
    status, loc, headers = login(c, "verify_cust", PW)
    report("login by USERNAME works", status == 302 and loc == "/dashboard/customer/", f"status={status} loc={loc}")

    c = Client()
    status, loc, headers = login(c, "customer@servigo.com", "customer12345")
    report("login seeded customer -> customer dashboard", status == 302 and loc == "/dashboard/customer/", f"status={status} loc={loc}")

    c = Client()
    status, loc, headers = login(c, "staff@servigo.com", "staff12345")
    report("login staff -> staff dashboard", status == 302 and loc == "/dashboard/staff/", f"status={status} loc={loc}")

    c = Client()
    status, loc, headers = login(c, "admin@servigo.com", "admin12345")
    report("login admin -> Django admin index", status == 302 and loc == "/admin/", f"status={status} loc={loc}")

    # invalid credentials (fresh session each time)
    c = Client()
    status, _, body, headers = c.post_form(
        "/accounts/login/",
        {"csrfmiddlewaretoken": c.csrf("/accounts/login/"), "username": "customer@servigo.com", "password": "wrongpass"},
        referer=BASE + "/accounts/login/",
    )
    report("invalid password -> graceful error (200, no 500)", status == 200 and "Invalid" in body, f"status={status}")

    c = Client()
    status, _, body, headers = c.post_form(
        "/accounts/login/",
        {"csrfmiddlewaretoken": c.csrf("/accounts/login/"), "username": "nobody@servigo.com", "password": "whatever123"},
        referer=BASE + "/accounts/login/",
    )
    report("nonexistent user -> graceful error (200, no 500)", status == 200 and "Invalid" in body, f"status={status}")

    # ---------- DASHBOARDS & ACCESS CONTROL ----------
    print("\n--- DASHBOARDS & ACCESS CONTROL ---")
    c = Client()
    login(c, "customer@servigo.com", "customer12345")
    status, _, body, _ = c.get("/dashboard/customer/")
    report("customer dashboard renders (200)", status == 200 and "Customer Dashboard" in body, f"status={status}")

    status, _, _, headers = c.get("/dashboard/staff/")
    report("customer blocked from staff dashboard (redirect to customer)", status == 302 and "/dashboard/customer/" in headers.get("Location", ""), f"status={status} loc={headers.get('Location','')}")

    status, _, _, headers = c.get("/dashboard/admin/")
    report("customer blocked from admin dashboard (redirect to customer)", status == 302 and "/dashboard/customer/" in headers.get("Location", ""), f"status={status} loc={headers.get('Location','')}")

    c = Client()
    login(c, "staff@servigo.com", "staff12345")
    status, _, body, _ = c.get("/dashboard/staff/")
    report("staff dashboard renders (200)", status == 200 and "Staff Dashboard" in body, f"status={status}")

    c = Client()
    login(c, "admin@servigo.com", "admin12345")
    status, _, body, _ = c.get("/dashboard/admin/")
    report("admin dashboard renders (200)", status == 200, f"status={status}")
    status, _, _, _ = c.get("/admin/")
    report("Django admin accessible to admin", status == 200, f"status={status}")

    # ---------- LOGOUT / SESSION ----------
    print("\n--- LOGOUT / SESSION ---")
    c = Client()
    login(c, "admin@servigo.com", "admin12345")
    # Grab the CSRF token from an authenticated page (GET /accounts/logout/
    # would itself log the user out, so we fetch the dashboard instead).
    c.get("/dashboard/admin/")
    token = next((cookie.value for cookie in c.jar if cookie.name == "csrftoken"), None)
    status, _, _, headers = c.post_form(
        "/accounts/logout/", {"csrfmiddlewaretoken": token}, referer=BASE + "/accounts/logout/"
    )
    _loc = headers.get("Location", "").rstrip("/")
    report("logout -> redirect home", status == 302 and _loc in ("", BASE), f"status={status} loc={headers.get('Location','')}")

    status, _, _, headers = c.get("/dashboard/admin/")
    report("session cleared after logout (protected page redirects to login)", status == 302 and "/accounts/login/" in headers.get("Location", ""), f"status={status} loc={headers.get('Location','')}")

    # protected pages without login
    c2 = Client()
    status, _, _, headers = c2.get("/dashboard/customer/")
    report("unauthenticated dashboard -> login redirect", status == 302 and "/accounts/login/" in headers.get("Location", ""), f"status={status} loc={headers.get('Location','')}")

    # ---------- SMART TV IMAGE ----------
    print("\n--- SMART TV IMAGE ---")
    status, _, body, _ = c2.get("/static/images/Smart_tv_repair.jpg")
    report("Smart_tv_repair.jpg loads via static (HTTP 200)", status == 200, f"status={status}")

    status, _, body, _ = c2.get("/")
    smart_refs = body.count("images/Smart_tv_repair.jpg")
    report("Smart_tv_repair.jpg used in homepage Smart TV service card", smart_refs >= 1, f"refs={smart_refs}")
    report("other category images intact on homepage", ("images/electrical.jpg" in body) and ("images/plumbing.jpg" in body), "")
    report("old smart-tv.jpg no longer used on homepage", "images/smart-tv.jpg" not in body, "")

    status, _, body, _ = c2.get("/services/category/smart-tv/")
    smart_refs = body.count("images/Smart_tv_repair.jpg")
    report("Smart_tv_repair.jpg used across Smart TV category page", smart_refs >= 3, f"refs={smart_refs}")

    status, _, body, _ = c2.get("/services/smart-tv/smart-tv-install/")
    report("Smart TV service detail page uses Smart_tv_repair.jpg", "images/Smart_tv_repair.jpg" in body, "")

    status, _, body, _ = c2.get("/services/category/electrical/")
    report("electrical category does NOT use Smart_tv_repair.jpg", "images/Smart_tv_repair.jpg" not in body, "")
    report("electrical category keeps its own image", "images/electrical.jpg" in body, "")

    status, _, body, _ = c2.get("/services/category/plumbing/")
    report("plumbing category does NOT use Smart_tv_repair.jpg", "images/Smart_tv_repair.jpg" not in body, "")
    report("plumbing category keeps its own image", "images/plumbing.jpg" in body, "")

    # ---------- SUMMARY ----------
    print("\n" + "=" * 60)
    print(f"RESULTS: {PASS} PASS, {FAIL} FAIL")
    print("=" * 60)
    for r in results:
        print(r)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
