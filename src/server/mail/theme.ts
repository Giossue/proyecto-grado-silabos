export const MAIL_THEME_CSS = `
body,
body *:not(html):not(style):not(br):not(tr):not(code) {
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif,
        'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
    position: relative;
}

body {
    -webkit-text-size-adjust: none;
    background-color: #eef2f7;
    color: #121c28;
    height: 100%;
    line-height: 1.4;
    margin: 0;
    padding: 0;
    width: 100% !important;
}

p,
ul,
ol,
blockquote {
    line-height: 1.4;
    text-align: start;
}

a {
    color: #122c41;
}

a img {
    border: none;
}


h1 {
    color: #122c41;
    font-size: 18px;
    font-weight: bold;
    margin-top: 0;
    text-align: start;
}

h2 {
    font-size: 16px;
    font-weight: bold;
    margin-top: 0;
    text-align: start;
}

h3 {
    font-size: 14px;
    font-weight: bold;
    margin-top: 0;
    text-align: left;
}

p {
    font-size: 16px;
    line-height: 1.5em;
    margin-top: 0;
    text-align: left;
}

p.sub {
    font-size: 12px;
}

img {
    max-width: 100%;
}


.wrapper {
    -premailer-cellpadding: 0;
    -premailer-cellspacing: 0;
    -premailer-width: 100%;
    background-color: #eef2f7;
    margin: 0;
    padding: 0;
    width: 100%;
}

.content {
    -premailer-cellpadding: 0;
    -premailer-cellspacing: 0;
    -premailer-width: 100%;
    margin: 0;
    padding: 0;
    width: 100%;
}


.header {
    padding: 25px 0;
    text-align: center;
}

.header a {
    color: #122c41;
    font-size: 19px;
    font-weight: bold;
    text-decoration: none;
}


.logo {
    height: 75px;
    margin-top: 15px;
    margin-bottom: 10px;
    max-height: 75px;
    width: 75px;
}


.body {
    -premailer-cellpadding: 0;
    -premailer-cellspacing: 0;
    -premailer-width: 100%;
    background-color: #eef2f7;
    border-bottom: 1px solid #eef2f7;
    border-top: 1px solid #eef2f7;
    margin: 0;
    padding: 0;
    width: 100%;
}

.inner-body {
    -premailer-cellpadding: 0;
    -premailer-cellspacing: 0;
    -premailer-width: 570px;
    background-color: #ffffff;
    border-color: #dbe3ec;
    border-radius: 8px;
    border-width: 1px;
    border-style: solid;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
    margin: 0 auto;
    padding: 0;
    width: 570px;
}

.inner-body a {
    word-break: break-all;
}


.subcopy {
    border-top: 1px solid #dbe3ec;
    margin-top: 25px;
    padding-top: 25px;
}

.subcopy p {
    font-size: 14px;
}


.footer {
    -premailer-cellpadding: 0;
    -premailer-cellspacing: 0;
    -premailer-width: 570px;
    margin: 0 auto;
    padding: 0;
    text-align: center;
    width: 570px;
}

.footer p {
    color: #5b6b7f;
    font-size: 12px;
    text-align: center;
}

.footer a {
    color: #5b6b7f;
    text-decoration: underline;
}


.table table {
    -premailer-cellpadding: 0;
    -premailer-cellspacing: 0;
    -premailer-width: 100%;
    margin: 30px auto;
    width: 100%;
}

.table th {
    border-bottom: 1px solid #dbe3ec;
    margin: 0;
    padding-bottom: 8px;
}

.table td {
    color: #121c28;
    font-size: 15px;
    line-height: 18px;
    margin: 0;
    padding: 10px 0;
}

.content-cell {
    max-width: 100vw;
    padding: 32px;
}


.action {
    -premailer-cellpadding: 0;
    -premailer-cellspacing: 0;
    -premailer-width: 100%;
    margin: 30px auto;
    padding: 0;
    text-align: center;
    width: 100%;
    float: unset;
}

.button {
    -webkit-text-size-adjust: none;
    border-radius: 4px;
    color: #fff;
    display: inline-block;
    overflow: hidden;
    text-decoration: none;
}

.button-blue,
.button-primary {
    background-color: #122c41;
    border-bottom: 8px solid #122c41;
    border-left: 18px solid #122c41;
    border-right: 18px solid #122c41;
    border-top: 8px solid #122c41;
}

.button-green,
.button-success {
    background-color: #16a34a;
    border-bottom: 8px solid #16a34a;
    border-left: 18px solid #16a34a;
    border-right: 18px solid #16a34a;
    border-top: 8px solid #16a34a;
}

.button-red,
.button-error {
    background-color: #dc2626;
    border-bottom: 8px solid #dc2626;
    border-left: 18px solid #dc2626;
    border-right: 18px solid #dc2626;
    border-top: 8px solid #dc2626;
}


.panel {
    border-left: #122c41 solid 4px;
    margin: 21px 0;
}

.panel-content {
    background-color: #eef2f7;
    color: #121c28;
    padding: 16px;
}

.panel-content p {
    color: #121c28;
}

.panel-item {
    padding: 0;
}

.panel-item p:last-of-type {
    margin-bottom: 0;
    padding-bottom: 0;
}


.break-all {
    word-break: break-all;
}


@media (prefers-color-scheme: dark) {
    body,
    .wrapper,
    .body {
        background-color: #181b20 !important;
        border-color: #181b20 !important;
    }

    .inner-body {
        background-color: #21252b !important;
        border-color: #3a4652 !important;
        box-shadow: none !important;
    }

    body,
    p,
    li,
    .table td,
    .panel-content,
    .panel-content p {
        color: #eef0f3 !important;
    }

    h1,
    h2,
    h3,
    .header a {
        color: #eef0f3 !important;
    }

    .inner-body a:not(.button) {
        color: #a9c1e2 !important;
    }

    .footer p,
    .footer a,
    .subcopy p {
        color: #a9b2bc !important;
    }

    .subcopy {
        border-top-color: #3a4652 !important;
    }

    .button-blue,
    .button-primary {
        background-color: #5274a8 !important;
        border-color: #5274a8 !important;
        color: #ffffff !important;
    }
}
`
