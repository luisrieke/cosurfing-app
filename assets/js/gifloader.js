document.addEventListener("DOMContentLoaded", function () {
  var gifs = [
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcjczbmt6aXdoYWM1amtrcnpxNmExZXAxZDdieG5xZmI1MWJ6aXVibCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IwAZ6dvvvaTtdI8SD5/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcjczbmt6aXdoYWM1amtrcnpxNmExZXAxZDdieG5xZmI1MWJ6aXVibCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/U4DswrBiaz0p67ZweH/giphy.gif",
    "https://media.giphy.com/media/TgC8jEirdyKICUVPPs/giphy.gif?cid=790b7611r73nkziwhac5jkkrzq6a1ep1d7bxnqfb51bziubl&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/KzDqC8LvVC4lshCcGK/giphy.gif?cid=790b7611r73nkziwhac5jkkrzq6a1ep1d7bxnqfb51bziubl&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif?cid=790b7611r73nkziwhac5jkkrzq6a1ep1d7bxnqfb51bziubl&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/HloNK1z39EkEQcreIo/giphy.gif?cid=790b7611r73nkziwhac5jkkrzq6a1ep1d7bxnqfb51bziubl&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/3rgXBQIDHkFNniTNRu/giphy.gif?cid=790b7611r73nkziwhac5jkkrzq6a1ep1d7bxnqfb51bziubl&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/KYwOggcuQOyY/giphy.gif?cid=ecf05e47g0i6dxma4kcrj4f8zzdrpff18x0a41uysa7m8tut&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeTBqNXN2MXM2dmRlYWxubWFvNHBoMTk2NW1qZDFoMnliczJmemR6aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3ohzdIuqJoo8QdKlnW/giphy.gif",
    "https://media.giphy.com/media/3o6UB3VhArvomJHtdK/giphy.gif?cid=790b7611y0j5sv1s6vdealnmao4ph1965mjd1h2ybs2fzdzh&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/DffShiJ47fPqM/giphy.gif?cid=790b7611y0j5sv1s6vdealnmao4ph1965mjd1h2ybs2fzdzh&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/hXDrTueJWAscK3xWQ2/giphy.gif?cid=790b7611y0j5sv1s6vdealnmao4ph1965mjd1h2ybs2fzdzh&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/xUySTUZ8A2RJBQitEc/giphy.gif?cid=790b7611y0j5sv1s6vdealnmao4ph1965mjd1h2ybs2fzdzh&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/MNmyTin5qt5LSXirxd/giphy.gif?cid=790b7611y0j5sv1s6vdealnmao4ph1965mjd1h2ybs2fzdzh&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/oGO1MPNUVbbk4/giphy.gif?cid=ecf05e47hwq1wxqczawq6d1701fg8h5wv9q7rrzkj9rs2uyq&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/NbXTwsoD7hvag/giphy.gif?cid=ecf05e47hwq1wxqczawq6d1701fg8h5wv9q7rrzkj9rs2uyq&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa3g5cHo3NTBnd2o0djMzcWFrMzF3a2ptZDdpaHB2NGZrYmV4bjhmMyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/cXblnKXr2BQOaYnTni/giphy.gif",
    "https://media.giphy.com/media/KBfKueAjIJV8Q/giphy.gif?cid=790b7611kx9pz750gwj4v33qak31wkjmd7ihpv4fkbexn8f3&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif?cid=ecf05e47mdwcg3k8gvumogzwsl9agvzb5nr4t44hr4qedw34&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/3oooX87pROnnPMxjcZ/giphy.gif?cid=ecf05e47jj8evd4tob0yfprsbqylrim1qigqoedyyub36hdo&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/Qa97lmqC43yIyOEzwT/giphy.gif?cid=ecf05e47edhnmpy0f6b0cjzfl03qjx417pne82e57dbhvzqc&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZDZsand2emM0b25jMXNsMDJ1YTRhaWVxNDlvNWx2OGxyeGZvOTN6cSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vKHKDIdvxvN7vTAEOM/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZDZsand2emM0b25jMXNsMDJ1YTRhaWVxNDlvNWx2OGxyeGZvOTN6cSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26ufdipQqU2lhNA4g/giphy.gif",
    "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif?cid=790b7611d6ljwvzc4onc1sl02ua4aieq49o5lv8lrxfo93zq&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/MQ4bWOjn8C9tT2dzIb/giphy.gif?cid=790b7611d6ljwvzc4onc1sl02ua4aieq49o5lv8lrxfo93zq&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/jtQpRa3y7S2Ke3JvQE/giphy.gif?cid=790b7611prquak7xnkzao5mlah4qfpinhoz7fe3u5ga7cpob&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/Aw2V3gGD5znfG/giphy.gif?cid=790b7611prquak7xnkzao5mlah4qfpinhoz7fe3u5ga7cpob&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/XRB1uf2F9bGOA/giphy.gif?cid=790b7611prquak7xnkzao5mlah4qfpinhoz7fe3u5ga7cpob&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media.giphy.com/media/ekkKldHuLW90Y/giphy.gif?cid=790b7611prquak7xnkzao5mlah4qfpinhoz7fe3u5ga7cpob&ep=v1_gifs_search&rid=giphy.gif&ct=g",
  ];

  var randomIndex = Math.floor(Math.random() * gifs.length);
  var randomGif = gifs[randomIndex];

  document.getElementById("randomGif").src = randomGif;
});
