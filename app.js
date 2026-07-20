const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

const db = mysql.createConnection({
    host: 'c237-meilan-mysql.mysql.database.azure.com',
    user: 'c237_005',
    password: 'c237005@2026!',
    database: 'C237_005_team1_ca2',
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: false, cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } }));
app.use(flash());

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource.');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.IsAdmin) return next();
    req.flash('error', 'Admin access only.');
    res.redirect('/comics');
};

app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/comics');
    } else {
        res.redirect('/login');
    }
});

app.get('/register', (req, res) => res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] || {} }));

app.post('/register', (req, res) => {
    const { username, email, password, contact } = req.body;
    if (!username || !email || !password || password.length < 6) {
        req.flash('error', 'Username, email and a password of at least 6 characters are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    const sql = 'INSERT INTO Users (Username, Password, Email, Contact) VALUES (?, SHA1(?), ?, ?)';
    db.query(sql, [username, password, email, contact || null], (err) => {
        if (err) {
            req.flash('error', err.code === 'ER_DUP_ENTRY' ? 'Username or email already exists.' : 'Unable to register user.');
            req.flash('formData', req.body);
            return res.redirect('/register');
        }
        req.flash('success', 'Registration successful. Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => res.render('login', { messages: req.flash('success'), errors: req.flash('error') }));

app.post('/login', (req, res) => {
    db.query('SELECT * FROM Users WHERE Email = ? AND Password = SHA1(?)', [req.body.email, req.body.password], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }
        req.session.user = results[0];
        res.redirect('/comics');
    });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// STUDENT C - view and display all comics.
app.get('/comics', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM Comics ORDER BY Title, Series, IssueNo', (err, results) => {
        if (err) throw err;
        res.render('index', { comics: results, user: req.session.user, messages: req.flash('success'), errors: req.flash('error') });
    });
});

// STUDENT C - view and display one selected comic.
app.get('/comic/:id', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Comic not found.');
        res.render('comic', { comic: results[0], user: req.session.user });
    });
});

app.get('/addComic', checkAuthenticated, checkAdmin, (req, res) => res.render('add', { user: req.session.user }));
app.post('/addComic', checkAuthenticated, checkAdmin, (req, res) => {
    const { comicId, title, series, issueNo, publisher, publishedYear, quantity } = req.body;
    db.query('INSERT INTO Comics (ComicId, Title, Series, IssueNo, Publisher, PublishedYear, Quantity) VALUES (?, ?, ?, ?, ?, ?, ?)', [comicId, title, series || null, issueNo, publisher || null, publishedYear || null, quantity], (err) => {
        if (err) throw err;
        req.flash('success', 'Comic added successfully.');
        res.redirect('/comics');
    });
});

app.get('/editComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Comic not found.');
        res.render('edit', { comic: results[0], user: req.session.user });
    });
});
app.post('/editComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { title, series, issueNo, publisher, publishedYear, quantity } = req.body;
    db.query('UPDATE Comics SET Title = ?, Series = ?, IssueNo = ?, Publisher = ?, PublishedYear = ?, Quantity = ? WHERE ComicId = ?', [title, series || null, issueNo, publisher || null, publishedYear || null, quantity, req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Comic updated successfully.');
        res.redirect('/comics');
    });
});

app.get('/deleteComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Comic not found.');
        res.render('delete', { comic: results[0], user: req.session.user });
    });
});
app.post('/deleteComic/:id', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('DELETE FROM Comics WHERE ComicId = ?', [req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Comic deleted successfully.');
        res.redirect('/comics');
    });
});

// Simple booking route - it can be extended by the teammate responsible for borrowing.
app.get('/bookingComic', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM Comics WHERE Quantity > 0 ORDER BY Title', (err, results) => {
        if (err) throw err;
        res.render('booking', { comics: results, user: req.session.user, errors: req.flash('error') });
    });
});
app.post('/booking/:id', checkAuthenticated, (req, res) => {
    const quantity = Number.parseInt(req.body.quantity, 10) || 1;
    db.query('SELECT * FROM Comics WHERE ComicId = ?', [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0 || results[0].Quantity < quantity) {
            req.flash('error', 'Not enough copies are available.');
            return res.redirect('/bookingComic');
        }
        const comic = results[0];
        db.query('INSERT INTO Borrowed (UserId, ComicId, BorrowedQty, BorrowedDate, DueDate) VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY))', [req.session.user.UserId, comic.ComicId, quantity], (borrowErr) => {
            if (borrowErr) throw borrowErr;
            db.query('UPDATE Comics SET Quantity = Quantity - ? WHERE ComicId = ?', [quantity, comic.ComicId], (updateErr) => {
                if (updateErr) throw updateErr;
                req.flash('success', 'Comic booked successfully.');
                res.redirect('/comics');
            });
        });
    });
});

app.listen(process.env.PORT || 3000, () => console.log('Server started on http://localhost:3000'));