from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def homepage():
    return render_template("main.html")

if __name__ == "__main__":
    print("in your browser, open the url localhost:5000")
    app.run(debug=True)
