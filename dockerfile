FROM python:3.13.0

ENV PYTHONUNBUFFERED=1

WORKDIR /NanoServ

COPY requirements.txt ./

RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "127.0.0.1:8000"]

