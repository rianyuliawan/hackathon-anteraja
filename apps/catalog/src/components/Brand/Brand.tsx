export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <span className="grid size-11 place-items-center rounded-xl bg-[#fff7f2] ring-1 ring-[#f1ddd4] md:size-12">
        <img
          className="size-9 object-contain md:size-10"
          src="/images/fashionaja-symbol.png"
          alt=""
          width="40"
          height="40"
        />
      </span>
      <span
        className={`text-[20px] font-extrabold tracking-[-.07em] md:text-[23px] ${light ? "text-white" : "text-[#392137]"}`}
      >
        fashionaja<span className="text-[#ed7564]">.</span>
      </span>
    </span>
  );
}
